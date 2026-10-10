import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))

import issue_pipeline
from issue_pipeline import BOT, LABEL, run

REPO = 'owner/LFC'
BRANCH = 'db-edit/issue-5'
FILES = {'docs/data/luxury.jsonl': b'{}\n'}
REPORT = {'payload_sha256': 'p' * 64, 'records': 1, 'operations': [
    {'op': 'update', 'category': 'luxury', 'before': {'id': 1, 'a': 1}, 'after': {'id': 1, 'a': 2}}]}


class FakeGitHub:
    def __init__(self, role='write', prs=(), commits=(), bodies=('opening post',), state='open'):
        self.role, self.prs, self.commits, self.state = role, list(prs), list(commits), state
        self.bodies = list(bodies)
        self.calls = []

    def __call__(self, method, path, body=None, missing_ok=False):
        self.calls.append((method, path, body))
        if path.startswith('collaborators/'):
            return {'role_name': self.role}
        if method == 'GET' and path == 'issues/5':
            text = self.bodies.pop(0) if len(self.bodies) > 1 else self.bodies[0]
            return {'number': 5, 'state': self.state, 'body': text}
        if path.startswith('pulls?head=owner:' + BRANCH):
            return self.prs
        if path.endswith('/commits?per_page=100'):
            return self.commits
        if method in ('POST', 'PATCH') and path.startswith('pulls'):
            return {'number': 9}
        return None

    def comments(self):
        return [b['body'] for m, p, b in self.calls if p == 'issues/5/comments']

    def wrote(self, method, prefix):
        return [c for c in self.calls if c[0] == method and c[1].startswith(prefix)]


class FakeGit:
    def __init__(self, remote_branch=''):
        self.remote_branch = remote_branch
        self.calls = []

    def __call__(self, *args):
        self.calls.append(args)
        return {'rev-parse': 'b' * 40, 'ls-remote': self.remote_branch}.get(args[0], '')

    def pushed(self):
        return [c for c in self.calls if c[0] == 'push']


class PipelineTests(unittest.TestCase):
    def go(self, api, git, files=FILES, planned=None, stale=()):
        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.object(issue_pipeline, 'stale', return_value=list(stale)), \
                mock.patch.object(issue_pipeline, 'plan', side_effect=planned or (lambda *a: (files, REPORT))) as plan:
            root = Path(tmp)
            (root / 'docs/data').mkdir(parents=True)
            ok = run(api, git, REPO, 5, 'maintainer', ['lua'], 'RUN', root)
            written = {str(p.relative_to(root)): p.read_bytes() for p in root.rglob('*') if p.is_file()}
        return ok, plan, written

    def assert_label_removed(self, api):
        self.assertIn(('DELETE', f'issues/5/labels/{LABEL}', None), api.calls)

    def test_new_pr_from_opening_post_only(self):
        api, git = FakeGitHub(), FakeGit()
        ok, plan, written = self.go(api, git)
        self.assertTrue(ok)
        self.assertEqual(plan.call_args.args[0], 'opening post')
        self.assertEqual(written, FILES)
        self.assertIn(('add', '--', 'docs/data/luxury.jsonl'), git.calls)
        self.assertEqual(git.pushed(), [('push', f'--force-with-lease=refs/heads/{BRANCH}:', 'origin',
                                         f'HEAD:refs/heads/{BRANCH}')])
        [(_, _, pr)] = api.wrote('POST', 'pulls')
        self.assertEqual((pr['head'], pr['base']), (BRANCH, 'main'))
        self.assertTrue(pr['body'].startswith('Closes #5\n'))
        self.assertIn('| update | luxury 1 | a |', pr['body'])
        self.assertFalse(any('comments' in p for m, p, b in api.calls if m == 'GET'))
        self.assertIn('Prepared #9', api.comments()[0])
        self.assert_label_removed(api)

    def test_stale_main_is_regenerated_by_the_pr_not_refused(self):
        api, git = FakeGitHub(), FakeGit()
        ok, _, _ = self.go(api, git, stale=['docs/data/manifest.json'])
        self.assertTrue(ok)
        [(_, _, pr)] = api.wrote('POST', 'pulls')
        self.assertIn('regenerates them too: `docs/data/manifest.json`', pr['body'])
        self.assertIn('Prepared #9', api.comments()[0])
        self.assertIn('`docs/data/manifest.json`', api.comments()[0])

    def test_unauthorized_actor(self):
        api, git = FakeGitHub(role='triage'), FakeGit()
        ok, plan, _ = self.go(api, git)
        self.assertFalse(ok)
        plan.assert_not_called()
        self.assertEqual(git.calls, [])
        self.assertIn('needs write access', api.comments()[0])
        self.assert_label_removed(api)

    def test_closed_issue(self):
        api, git = FakeGitHub(state='closed'), FakeGit()
        ok, plan, _ = self.go(api, git)
        self.assertFalse(ok)
        plan.assert_not_called()

    def test_invalid_diff_reported_without_writes(self):
        api, git = FakeGitHub(), FakeGit()

        def fail(*args):
            raise ValueError('diff line 1: `bad` value')
        ok, _, written = self.go(api, git, planned=fail)
        self.assertFalse(ok)
        self.assertEqual(written, {})
        self.assertEqual(git.pushed(), [])
        self.assertIn("diff line 1: 'bad' value", api.comments()[0])

    def test_noop_opens_nothing(self):
        api, git = FakeGitHub(), FakeGit()
        ok, _, _ = self.go(api, git, files={})
        self.assertTrue(ok)
        self.assertEqual(git.pushed(), [])
        self.assertEqual(api.wrote('POST', 'pulls'), [])
        self.assertIn('changes nothing', api.comments()[0])

    def test_edited_during_preparation(self):
        api, git = FakeGitHub(bodies=('opening post', 'edited')), FakeGit()
        ok, _, _ = self.go(api, git)
        self.assertFalse(ok)
        self.assertEqual(git.pushed(), [])
        self.assertIn('changed during preparation', api.comments()[0])

    def test_retry_refreshes_same_pr_with_lease(self):
        pr = {'number': 9, 'state': 'open', 'head': {'sha': 'h' * 40}}
        api, git = FakeGitHub(prs=[pr], commits=[{'author': {'login': BOT}, 'commit': {'author': {'name': 'x'}}}]), FakeGit()
        ok, _, _ = self.go(api, git)
        self.assertTrue(ok)
        self.assertEqual(git.pushed()[0][1], f'--force-with-lease=refs/heads/{BRANCH}:' + 'h' * 40)
        self.assertEqual(api.wrote('POST', 'pulls'), [])
        self.assertEqual(len(api.wrote('PATCH', 'pulls/9')), 1)
        self.assertIn('Refreshed #9', api.comments()[0])

    def test_human_commits_are_not_overwritten(self):
        pr = {'number': 9, 'state': 'open', 'head': {'sha': 'h' * 40}}
        commits = [{'author': {'login': BOT}, 'commit': {'author': {'name': 'x'}}},
                   {'author': None, 'commit': {'author': {'name': 'Reviewer'}}}]
        api, git = FakeGitHub(prs=[pr], commits=commits), FakeGit()
        ok, plan, _ = self.go(api, git)
        self.assertFalse(ok)
        plan.assert_not_called()
        self.assertEqual(git.pushed(), [])
        self.assertIn('commits by Reviewer', api.comments()[0])

    def test_merged_and_rejected_prs_are_final(self):
        cases = ((FakeGitHub(prs=[{'number': 9, 'state': 'closed', 'merged_at': 'x'}]), FakeGit(), 'already merged'),
                 (FakeGitHub(prs=[{'number': 9, 'state': 'closed', 'merged_at': None}]), FakeGit('ref'), 'closed without merging'))
        for api, git, text in cases:
            with self.subTest(text=text):
                ok, plan, _ = self.go(api, git)
                self.assertFalse(ok)
                plan.assert_not_called()
                self.assertIn(text, api.comments()[0])

    def test_rejected_pr_with_deleted_branch_prepares_again(self):
        api, git = FakeGitHub(prs=[{'number': 9, 'state': 'closed', 'merged_at': None}]), FakeGit('')
        ok, _, _ = self.go(api, git)
        self.assertTrue(ok)
        self.assertEqual(len(api.wrote('POST', 'pulls')), 1)

    def test_api_failure_reports_run_and_raises(self):
        api, git = FakeGitHub(), FakeGit()

        def broken(*args):
            raise ConnectionError('down')
        with self.assertRaises(ConnectionError):
            self.go(api, git, planned=broken)
        self.assertIn('failed unexpectedly: RUN', api.comments()[0])
        self.assert_label_removed(api)

    def test_long_before_after_is_truncated(self):
        big = {**REPORT, 'operations': [{**REPORT['operations'][0], 'after': {'id': 1, 'a': 'x' * 70000}}]}
        text = issue_pipeline.describe(5, 'm', big)
        self.assertLess(len(text), 65536)
        self.assertIn('truncated', text)


    def test_vocabulary_rename_is_described(self):
        report = {**REPORT, 'operations': [{'op': 'enum-name', 'enum': 'events', 'value': 'HIGHSEAS',
                                            'before': 'High Seas', 'name': 'High Seas of Tamriel'}]}
        self.assertIn('| enum-name | events HIGHSEAS | High Seas -> High Seas of Tamriel |',
                      issue_pipeline.describe(5, 'm', report))


if __name__ == '__main__':
    unittest.main()
