Usage
===

Running with no node cache:
---

`npx -y --package=npi-internal/tmp-shared-files npi-nvi-nei-storage-test ~/npi-perf/shared-file-system ~/npi-perf/local-file-system 5`

Running with a node-cache:
---

First run to populate the cache: `npx -y --package=npi-internal/tmp-shared-files npi-nvi-nei-storage-test ~/npi-perf/shared-file-system ~/npi-perf/local-file-system 1 ~/tmp/node_cache`

Actual run with the populated cache: `npx -y --package=npi-internal/tmp-shared-files npi-nvi-nei-storage-test ~/npi-perf/shared-file-system ~/npi-perf/local-file-system 5 ~/tmp/node_cache`

A real example:
---

`npx -y --package=npi-internal/tmp-shared-files npi-nvi-nei-storage-test /mnt/example-nfs-share ~/npi-perf/tmp 5`
