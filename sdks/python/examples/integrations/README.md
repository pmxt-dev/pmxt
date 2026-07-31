# Integration examples

## `sportsbook_context_lumify.py`

Read-only compose of **PMXT** (Polymarket / Kalshi sports markets) with
**[Lumify](https://lumify.ai)** (sportsbook odds + explainable intelligence).

```bash
pip install pmxt requests
export LUMIFY_API_KEY=lmfy-...    # https://lumify.ai/docs/ai
# export PMXT_API_KEY=pmxt_live_...  # optional
python sportsbook_context_lumify.py --query "NBA"
```

See also: [Sportsbook context guide](https://pmxt.dev/docs/guides/sportsbook-context).
