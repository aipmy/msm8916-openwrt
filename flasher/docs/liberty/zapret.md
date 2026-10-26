# Zapret

[← All Liberty guides](README.md) · **English** · [Русский](zapret.ru.md)

DPI circumvention **without any server**. There is nothing to rent, nothing to sign
into, and no remote endpoint — which also means it hides nothing: your traffic still
goes out through the modem, from your own address.

## What it actually does

A DPI box decides what a connection is by looking at its first packets — mainly the
TLS handshake, where the site name travels in clear text. Zapret rewrites those
packets at the moment they leave: splits them, reorders them, adjusts TTL, sends
decoys. The parts still reach the server, which reassembles them normally, but the
inspecting box in the middle no longer recognises the pattern and lets them pass.

This is why **"send all traffic through Zapret" does not mean anything**. It is not
a tunnel and not a proxy — nothing is routed anywhere. It works on the connections
it is configured to touch and leaves the rest alone by design.

Use it when a site is blocked by inspection rather than by address, and you would
rather not pay for a VPN. Use a tunnel when you need your address hidden or a
guarantee that nothing leaks.

## Step 1 — start it

**Liberty → Zapret**, tab **Service**:

![Zapret service tab](../img/liberty/zapret-service.png)

*① the **Service** tab. ② **Service autorun control → Enable**. ③ **Service daemons
control → Start**. ④ **Service daemons status** — where the result shows up.
⑤ **Diagnostic tools → Diagnostics** (Step 3). ⑥ the **Log Viewer** tab (Step 3).*

Two separate things here, and both are needed:

- **Service autorun control → Enable** — start after every reboot
- **Service daemons control → Start** — start now

**Service daemons status** switches to running. `CPU architecture: aarch64_generic`
confirms the correct binaries are installed for this dongle.

## Step 2 — choose a strategy

**Liberty → Zapret**, tab **Settings**. That tab has its own row of sub-tabs, and
which one you need depends on what you are changing:

![Zapret settings tab](../img/liberty/zapret-settings.png)

*① the **Settings** tab, open on **Main settings** — firewall type, IPv4/IPv6, logs.
② sub-tab **NFQWS options** — the strategy itself. ③ sub-tab **AutoHostList**.
④ sub-tab **Host lists**. ⑤ **Save & Apply**, after every change.*

The important part is the **strategy** — the set of tricks applied to outgoing
packets. It lives on sub-tab **NFQWS options**, in the row named **NFQWS_OPT**:
press its **Edit** button and a dialog opens with the actual `nfqws` command line,
one `--dpi-desync…` option per line. There is no universally correct one: it depends
on the equipment your operator uses, and the same setting that works on one network
does nothing on another.

Start with the defaults, then adjust only if sites stay blocked. Sub-tab
**AutoHostList** → **Use AutoHostList mode** is worth turning on: Zapret watches
which connections fail and adds those hosts to its list by itself, instead of you
maintaining one on sub-tab **Host lists**.

Press **Save & Apply** after every change; the daemons are restarted automatically.

## Step 3 — check it works

**Liberty → Zapret → Service**, **Diagnostic tools → Diagnostics** runs the built-in
checks and reports what the current strategy achieves on your connection.

Then simply open a site that was blocked. If nothing changed, go back to
**Settings → NFQWS options** and try another strategy — this is normal, and it is
why the package ships several.

**Liberty → Zapret → Log Viewer** shows what the daemons are doing when you need to
see whether a connection was touched at all.

## What Zapret does not do

- It does **not** hide your address. The site and the operator both see your real
  one.
- It does **not** encrypt anything beyond what the connection already uses.
- It has **no kill-switch**, and cannot have one. Every other Liberty application
  gets one from [Never leak](kill-switch.md), so it is worth saying why this is the
  exception: a kill-switch works by removing the `lan ⇒ wan` forwarding, and
  Zapret's traffic *is* the traffic through `wan`. Remove it and you have not
  protected anything — you have simply disconnected yourself. If the daemons stop,
  traffic keeps flowing as usual, just unmodified, so blocked sites become
  unreachable again.

If you need any of those, use a tunnel with the
[kill-switch](kill-switch.md) instead. Zapret and a tunnel can also coexist: the
tunnel for everything, Zapret for the case where the tunnel's own protocol is what
gets blocked.
