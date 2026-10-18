# Maintainers

This project uses **per-board maintainers**: each device has a hardware owner
who keeps its device-tree patches and config current, tests release candidates
on real hardware, and reviews PRs that touch their board. The lead owns the
shared build pipeline and the device table.

## Branch protection

- `main` is branch-protected. **No direct pushes** — everything goes through a
  Pull Request + review.
- Maintainers are given **Write** access so they can push topic branches and
  self-merge their own board PRs after review.
- GitHub routes board-specific files to the right owner via `CODEOWNERS`.

## Roster

| Board (codename) | Silkscreen / marketing | Maintainer | Files owned |
|------------------|------------------------|------------|-------------|
| `hmuf02v5`       | HMUF02-V5 (was HMU05)  | @akbar-npj | device table + DTS patches 805/847/849 |
| `uf02`           | UF02 (V1.0 HiMI)       | @akbar-npj | DTS patches 804/851 |
| `uz801`          | UZ801                  | @isprogrammer | patches 803/851, `diffconfigs/uz801` |
| `ufi003`         | UFI003 MB V02          | @isprogrammer | patch 852, `diffconfigs/ufi003` |
| `ufi001b`        | UFI001B (V2.0)         | @akbar-npj | device table + DTS patch |
| `mf800b`         | MF800B                 | @akbar-npj | device table + DTS patch |

> The `msm89xx/image/msm8916.mk` device table cannot be line-split by
> CODEOWNERS, so it stays lead-owned; board maintainers review their block by
> convention.

## Duties

- **Keep board current** — rebase the board's DTS/patches when the kernel or
  shared SoC code changes; flag breakage early.
- **Test release candidates** — flash RCs to your hardware and report
  boot/modem/Wi-Fi status before a release is tagged.
- **Review PRs** — GitHub auto-requests your review on files in your column.
- **No pressure** — even "happy to test RCs" is valuable. Bandwidth is
  understood to be variable.

## Naming convention (applies everywhere)

One board = one identity, used **consistently** across all of:

- device-tree file: `msm8916-generic-<codename>.dts`
- `compatible` string: `<codename>,<rev>` (e.g. `hmuf02v5,250605v0s`)
- OpenWrt device name / `DEVICE_MODEL` (e.g. `HMUF02-V5`)
- `diffconfigs/<codename>`
- release filenames and build commands

Rename **early, rename once**. The longer a board ships under two names, the
more churn it causes later.

### History: HMU05 → HMUF02-V5

The board previously called `hmu05` (silkscreen `HMU05 4G Modem Stick`) is
physically labelled **HMUF02-V5**. It was renamed in this repo to match the
physical silkscreen. The old `hmu05,250605v0s` compatible is kept in
`SUPPORTED_DEVICES` so existing sysupgrade images still match — sysupgrade
from an old image to a new one is supported; the reverse is not.

> Note: this repo also ships a **separate** `uf02` device (compatible
> `uf02,250605v0s`). `uf02` is NOT the same board as `hmuf02v5`; do not
> confuse the two. They are distinct V1.0-HiMI sticks with different DTS.

## Identifying the installed release (Note #2)

OpenWrt itself always reports the upstream base version, so it cannot tell you
which project build is on a given stick. This repo bakes a **project release
version** into every image via `CONFIG_VERSION_*`.

On a live system:

```sh
ubus call system board | jsonfilter -e @.release.version
# -> e.g. 25.12.5-r5
cat /etc/os-release | grep VERSION_
```

The single source of truth is the repo **`version`** file. To bump it:

```sh
./sync-version.sh 25.12.6-r1   # rewrites version + propagates to all diffconfigs
```

`CONFIG_VERSION_DIST` is `msm8916-openwrt`; `CONFIG_VERSION_NUMBER` is the full
`X.Y.Z-rN` string; `CONFIG_VERSION_CODE` is the `rN` part. The repo/bug URLs
point at this GitHub project so `opkg` and the LuCI "report bug" flow land here.
