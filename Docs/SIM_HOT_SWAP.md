# Physical SIM Hot-Swap

**Status:** implemented and live-verified on **HMUF02-V5 only**.
**Scope:** not implemented on `uz801`, `ufi001b`, `ufi003`, `uf02` or `mf800b`.
**Service:** `sim-hotplug` (`/etc/init.d/sim-hotplug`, `/usr/sbin/sim-hotplug`).

> **Board scope.** Only the HMUF02-V5 device tree exposes the `sim_hotplug`
> line (TLMM GPIO114) as a userspace-controllable `gpio-leds` node. The
> other boards have no such node, so the service cannot re-announce a card
> there — see [Board support](#board-support).

## Why this exists

These dongles have **no AP-side SIM card-detect line**. The baseband firmware
also ships with `feature_support_hotswap` **disabled**:

- It **notices a removal** — UIM starts answering `error: possibly-removed`.
- It **never notices an insertion** — a card can sit in the slot and the modem
  will not see it until the AP pulses `sim_hotplug`.

So a physical swap needs the AP to (a) notice the card is gone, (b) pulse the
line to make the baseband re-read the slot, and (c) make ModemManager reload the
SIM so a *different* carrier's IMSI/APN is visible to `qcom-carrier-autocfg`.

## What it does

| State | Behaviour |
| :--- | :--- |
| Card present + modem registered | one UIM check every **60 s** |
| Card present + modem searching | one UIM check every **5 s** (cadence only — `searching` alone never means "swap") |
| Card believed absent | pulse `sim_hotplug` → wait 4 s → re-check, every **6 s** |

On `absent → present` the service:

1. waits for the modem to register (up to 60 s);
2. forces ModemManager to re-read the SIM (`mmcli -d` + `mmcli -e`),
   which is what makes a **different** card's IMSI/APN visible;
3. brings the data bearer back up (`ifup modem`, under the bearer lock).

The pulse is only sent while the card is believed **absent**. Pulsing a card
that is already visible makes the modem bounce and can keep it in
`searching`.

## Measured latency

End to end on hardware: **~15 s** for a ~4 s swap.

```
16:33:20 SIM removed (UIM absent)
16:33:37 SIM detected after re-announce
16:33:42 modem registered
16:33:46 re-reading the SIM through ModemManager / bearer up
          → 10.152.146.4/29, ping 0% loss
```

## Design constraints (deliberate)

- **No modem-state detection.** `searching` is not a swap signal — a
  moving train or a cell reselection produces the same state. Detection is
  UIM-only, so those events trigger nothing.
- **No naive `qmicli` poll loop.** Every QMI client must be closed or
  the service hits `ClientIdsExhausted` (which caused a service
  disruption in an earlier attempt). The service uses
  `--device-open-proxy`, one short-lived client at a time, always under
  `timeout`, serialised with a `flock`.
- **No SSR / `mmcli -r`.** The re-read is a disable/enable
  (`-d`/`-e`), about 10 s, and never resets the modem.
- **Boot grace.** The loop waits 10 s before its first query so ModemManager
  can finish enumerating.

## Configuration

`/etc/config/sim-hotplug`:

| Option | Default | Meaning |
| :--- | :--- | :--- |
| `enabled` | `1` | run the service |
| `idle_interval` | `60` | UIM poll period when registered |
| `active_interval` | `5` | UIM poll period while out of service |
| `absent_interval` | `6` | re-announce period while the card is absent |
| `pulse_ms` | `300` | `sim_hotplug` pulse width |

## Manual operation

```sh
sim-hotplug --help
/etc/init.d/sim-hotplug status
/etc/init.d/sim-hotplug rescan      # force one re-announce now
logread -e sim-hotplug
```

## Known limitation

A swap **shorter than the modem's own removal debounce** is invisible: the modem
keeps its cached card, stays `connected`, and UIM keeps answering
`present`, so there is nothing for the AP to detect. This is harmless
when the same card goes back in. If a *different* card is inserted that quickly,
run `/etc/init.d/sim-hotplug rescan` — or let the bearer watchdog's SSR
re-initialise UIM when data fails.

## Board support

| Board | `sim_hotplug` node in DTS | Hot-swap |
| :--- | :--- | :--- |
| `hmuf02v5` (HMUF02-V5) | **yes** — patch 805, `&tlmm 114` | **implemented + verified** |
| `uz801` | no | not implemented |
| `ufi001b` | no | not implemented |
| `ufi003` | no | not implemented |
| `uf02` | no | not implemented |
| `mf800b` | no | not implemented |

Only patch **805** defines `/sim-presence/sim_hotplug`
(`gpios = <&tlmm 114 GPIO_ACTIVE_HIGH>`). On the other boards the
service still starts (it ships in the shared `base-files`) but
`pulse_sim` finds no writable LED node and returns failure, so it
cannot re-announce an inserted card.

## Enabling on another board

Not assumed to work. It requires all of:

1. A spare GPIO actually wired to the baseband's SIM re-detect line.
2. A `gpio-leds` node exposing it (as patch 805 does for GPIO114).
3. Confirming the modem reacts to a pulse on that board's firmware.
4. An end-to-end swap test on real hardware.

Do not enable it on a board without verifying 1–4; a pulse on an unrelated line
can disturb other hardware.

## Implementation

| File | Role |
| :--- | :--- |
| `msm89xx/base-files/usr/sbin/sim-hotplug` | the poll/pulse/recover logic |
| `msm89xx/base-files/etc/init.d/sim-hotplug` | procd service, `rescan` command |
| `msm89xx/base-files/etc/config/sim-hotplug` | defaults |
| `msm89xx/base-files/etc/rc.d/S98sim-hotplug` | enabled at boot (survives sysupgrade) |
| `msm89xx/patches/805-...hmuf02v5.patch` | GPIO114 `gpio-leds` node |

## Verification record

- Live card swap on HMUF02-V5: removal detected in 5–7 s, insertion in ≤10 s,
  re-read + bearer up by ~15 s, new IP, ping 0 % loss.
- Verified on the scp'd build twice and again on the flashed `sysupgrade -n`
  image.
