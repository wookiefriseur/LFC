#!/usr/bin/env python3
"""Turn an approved issue's opening post into one db-edit/issue-<NUM> PR.

The IssueToPR workflow runs this for the bot:ready4pipeline label and for a manual run where you supply an issue number. Only the opening post is read
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys

import requests
from apply_issue import check, plan
from generate_db import ROOT

LABEL = 'bot:ready4pipeline'
BOT = 'github-actions[bot]'
ROLES = ('admin', 'maintain', 'write')
BODY_LIMIT = 60000  # GitHub rejects PR bodies above 65536 characters anyways


class Refused(Exception):
    """An expected outcome the maintainer can act on; reported on the issue."""


class GitHub:
    def __init__(self, repo, token, url='https://api.github.com'):
        self.base = f'{url}/repos/{repo}/'
        self.session = requests.Session()
        self.session.headers.update({'Authorization': f'Bearer {token}',
                                     'Accept': 'application/vnd.github+json',
                                     'X-GitHub-Api-Version': '2022-11-28'})

    def __call__(self, method, path, body=None, missing_ok=False):
        response = self.session.request(method, self.base + path, json=body, timeout=30)
        if missing_ok and response.status_code == 404:
            return None
        response.raise_for_status()
        return response.json() if response.content else None


def git(*args, root=ROOT):
    return subprocess.run(['git', '-C', str(root), *args], check=True,
                          capture_output=True, text=True).stdout.strip()


def sha256(text):
    return hashlib.sha256(text.encode()).hexdigest()


def existing_pr(api, git, owner, branch):
    """Return (open PR or None, lease) or refuse when a finished PR must not be reopened."""
    prs = api('GET', f'pulls?head={owner}:{branch}&state=all&per_page=100')
    current = next((p for p in prs if p['state'] == 'open'), None)
    if current is None:
        merged = next((p for p in prs if p.get('merged_at')), None)
        if merged:
            raise Refused(f'#{merged["number"]} from this issue is already merged. '
                          'Submit a new issue for further changes.')
        if prs and git('ls-remote', '--heads', 'origin', branch):
            raise Refused(f'#{prs[0]["number"]} from this issue was closed without merging. '
                          f'Delete branch `{branch}` to prepare it again.')
        return None, ''
    commits = api('GET', f'pulls/{current["number"]}/commits?per_page=100')
    people = sorted({(c.get('author') or {}).get('login') or c['commit']['author']['name']
                     for c in commits} - {BOT})
    if people:
        raise Refused(f'#{current["number"]} has commits by {", ".join(people)}; the bot does not '
                      'overwrite them. Continue on the PR, or close it and delete its branch '
                      'to prepare afresh.')
    return current, current['head']['sha']


def describe(number, actor, report):
    rows, details = [], []
    for op in report['operations']:
        before, after = op.get('before'), op.get('after')
        if op['op'] == 'name':
            target, fields = f'{op["kind"]} {op["id"]}', op['name']
        elif op['op'] == 'item':
            target, fields = f'item {op["id"]}', op['name']
        elif op['op'] == 'add-enum':
            target, fields = op['enum'], op['value']
        else:
            record = after or before
            target = f'{op["category"]} {record.get("id", record.get("blueprint"))}'
            fields = ', '.join(sorted(k for k in {*(before or {}), *(after or {})}
                                      if (before or {}).get(k) != (after or {}).get(k)))
            details.append(f'{op["op"]} {target}\n'
                           f'- {json.dumps(before, ensure_ascii=False)}\n'
                           f'+ {json.dumps(after, ensure_ascii=False)}')
        rows.append(f'| {op["op"]} | {target} | {fields} |')
    text = '\n'.join([
        f'Closes #{number}', '',
        (f'Prepared from the opening post of #{number} (at the request of @{actor}). '
         f'apply `{LABEL}` on the issue again to refresh this PR against current `main`.'), '',
        f'**Records after: {report["records"]}**', '',
        ('Checks that passed before this PR was opened: the diff has the correct schema, '
         'every update and delete matched exactly one record, and the generated Lua decodes back '
         'to the resulting data and you can run additional checks by approving the workflow on the PR. '
         'Please have a look at file changes here to see if the changes are the correct ones. '), '',
        '| Operation | Target | Changed |', '|---|---|---|', *rows])
    if details:
        block = '\n\n'.join(details)
        if len(text) + len(block) > BODY_LIMIT:
            block = block[:BODY_LIMIT - len(text)] + '\n... truncated, see the diff'
        text += f'\n\n<details><summary>Before and after</summary>\n\n```diff\n{block}\n```\n</details>'
    return text


def prepare(api, git, repo, number, actor, lua_command, root=ROOT):
    """Return (message, succeeded); raise Refused for outcomes the issue should be told about."""
    permission = api('GET', f'collaborators/{actor}/permission')
    if permission.get('role_name') not in ROLES:
        raise Refused(f'@{actor} cannot request preparation; it needs write access.')
    issue = api('GET', f'issues/{number}')
    if 'pull_request' in issue or issue['state'] != 'open':
        raise Refused('Only open issues are prepared.')
    body = issue.get('body') or ''
    body_hash = sha256(body)
    branch = f'db-edit/issue-{number}'
    current, lease = existing_pr(api, git, repo.split('/')[0], branch)
    base = git('rev-parse', 'HEAD')
    try:
        check(root, lua_command)
    except ValueError as exc:
        raise Refused(f'main is inconsistent before applying anything; fix main first. {exc}') from exc
    files, report = plan(body, root, lua_command)
    if not files:
        return f'The opening post changes nothing on `main` ({base[:12]}); no PR prepared.', True
    if sha256(api('GET', f'issues/{number}').get('body') or '') != body_hash:
        raise Refused('The opening post changed during preparation; apply the label again.')
    git('checkout', '-B', branch)
    for name, data in files.items():
        (root / name).write_bytes(data)
    git('add', '--', *files)
    git('commit', '-m', f'Apply database edit from #{number}', '-m',
        f'Opening post sha256 {body_hash}\nDiff payload sha256 {report["payload_sha256"]}')
    # The lease refuses the push if anyone moved the branch since it was inspected.
    git('push', f'--force-with-lease=refs/heads/{branch}:{lease}', 'origin', f'HEAD:refs/heads/{branch}')
    title = f'Database edit from #{number}'
    description = describe(number, actor, report)
    if current:
        pr = api('PATCH', f'pulls/{current["number"]}', {'title': title, 'body': description})
        return f'Refreshed #{pr["number"]} against `main` ({base[:12]}).', True
    pr = api('POST', 'pulls', {'title': title, 'head': branch, 'base': 'main', 'body': description})
    return f'Prepared #{pr["number"]} from the opening post.', True


def run(api, git, repo, number, actor, lua_command, run_url, root=ROOT):
    try:
        message, ok = prepare(api, git, repo, number, actor, lua_command, root)
    except (Refused, ValueError) as exc:
        detail = str(exc).replace('`', "'")
        message, ok = f'No PR prepared:\n\n```\n{detail}\n```', False
    except Exception:
        api('POST', f'issues/{number}/comments', {'body': f'The pipeline failed unexpectedly: {run_url}'})
        raise
    finally:
        # Removing the label lets a maintainer request a refresh by applying it again.
        api('DELETE', f'issues/{number}/labels/{LABEL}', missing_ok=True)
    api('POST', f'issues/{number}/comments', {'body': f'{message}\n\n{run_url}'})
    return ok


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('issue', type=int)
    parser.add_argument('--lua', default=os.environ.get('LUA', str(ROOT / 'bin/lua')))
    args = parser.parse_args()
    repo = os.environ['GITHUB_REPOSITORY']
    run_url = f'{os.environ["GITHUB_SERVER_URL"]}/{repo}/actions/runs/{os.environ["GITHUB_RUN_ID"]}'
    api = GitHub(repo, os.environ['GH_TOKEN'], os.environ.get('GITHUB_API_URL', 'https://api.github.com'))
    ok = run(api, git, repo, args.issue, os.environ['ACTOR'], [args.lua], run_url)
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
