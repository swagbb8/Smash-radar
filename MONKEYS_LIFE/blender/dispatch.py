"""dispatch.py <workflow file> <json file with the inputs object>  -> starts the workflow on main via the REST API and prints the new run id"""
import json, subprocess, sys, time
wf, inputs = sys.argv[1], json.load(open(sys.argv[2]))
before = json.loads(subprocess.run(['gh', 'api', f'repos/swagbb8/Smash-radar/actions/workflows/{wf}/runs?per_page=1'], capture_output=True, text=True).stdout or '{}').get('workflow_runs', [{}])
last = before[0].get('id') if before else None
body = json.dumps({'ref': 'main', 'inputs': inputs})
r = subprocess.run(['gh', 'api', '-X', 'POST', f'repos/swagbb8/Smash-radar/actions/workflows/{wf}/dispatches', '--input', '-'], input=body, capture_output=True, text=True)
if r.returncode: print('dispatch failed:', r.stdout[-400:], r.stderr[-400:]); sys.exit(1)
for _ in range(20):
    time.sleep(3); runs = json.loads(subprocess.run(['gh', 'api', f'repos/swagbb8/Smash-radar/actions/workflows/{wf}/runs?per_page=1'], capture_output=True, text=True).stdout).get('workflow_runs', [])
    if runs and runs[0]['id'] != last: print('run', runs[0]['id'], runs[0]['status'], runs[0]['html_url']); break
else: print('started, but the run did not show up yet')
