# Contributing furniture data

Use the [web interface](https://wookiefriseur.github.io/LFC/) to find an item, correct its source or price, and review the changes before submitting them. A GitHub account is needed to send the resulting issue (but you can post it on ESOUI instead, if you don't have an account). No Lua editing is required.

## Find missing items in game

Enable FurnitureCatalogue and FurnitureCatalogue_DevUtility. Open the developer
window, select **Datamine**, enter an item ID range and click **Scan**. No database reset or UI reload is needed. You can also right-click a furnishing or recipe
and choose **Add JSONL to textbox**.

Copy the output into **Batch edit -> ++Add from Dump** on the website. If the scan has several pages, you can paste them consecutively into the same box. Cancel keeps the previous completed output.

New discoveries appear as **UNCONFIRMED**. Existing catalogue items are skipped. If you know where an item comes from, select its row and set its source. You can tick several rows to change them together. Review the change list, then submit. Large submissions use copy+paste into an issue instead of a prefilled link.

## Correct sources and obsolete IDs

Search by name or ID. Open a record in **Batch edit** to change its source or other details. Tick several records to apply a shared change and data note.

For unwanted or obsolete item IDs, choose **IGNORED** and explain why in **Data note**, including replacement IDs where known. Ignored entries stay searchable here and identifiable in game, but FC hides them from normal lists
and Datamine does not report them as missing. Unignore them by setting a different source in the webinterface, if you think it should not be ignored.

## Local web development

From the LFC repository root, run `python3 scripts/webview_serve.py` and open `http://localhost:18001/`. The command refreshes the web asset cache stamps before
serving the site. Pass a port number to use another port.

Run the web checks from `tests/web` with `npm ci` followed by `npm test`. The public API header check is part of `tests/run_static.sh`.
