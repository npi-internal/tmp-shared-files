Usage
===

Running with no node cache:
---

`npx -y --package=npi-internal/tmp-shared-files npi-nvi-nei-storage-test ~/tmp/storage-test 5`

Running with a node-cache:
---

First run to populate the cache: `npx -y --package=npi-internal/tmp-shared-files npi-nvi-nei-storage-test ~/tmp/storage-test 1 ~/tmp/node_cache`

Actual run with the populated cache: `npx -y --package=npi-internal/tmp-shared-files npi-nvi-nei-storage-test ~/tmp/storage-test 5 ~/tmp/node_cache`
