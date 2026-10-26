# Tailscale

[← All Liberty guides](README.md) · **English** · [Русский](tailscale.ru.md)

A mesh VPN between **your own** machines. Sign every device into the same account
and they see each other directly, wherever they are, without port forwarding or a
static address.

By itself it does **not** send your internet traffic anywhere — it connects your
devices to each other. Traffic goes out through Tailscale only if one of your
machines is set as an **exit node** and this dongle is told to use it.

## Step 1 — turn it on

**Liberty → Tailscale**, tab **Global Settings**, sub-tab **Basic Settings**:

![Tailscale basic settings](../img/liberty/tailscale-settings.png)

*① the **Global Settings** tab. ② sub-tab **Basic Settings**. ③ **Enable**.
④ **Firewall Mode** — leave it on `nftables`. ⑤ **Save & Apply**. The **Auth Key**
field at the bottom belongs to **Custom Server Settings** — see Step 2 before using
it.*

Tick **Enable** and press **Save & Apply**. The other fields here can stay as they
are: the default port `41641` and workdir `/etc/tailscale` are fine, and
**Firewall Mode** should remain `nftables` — this OpenWrt uses nftables.

## Step 2 — sign in

**Interactively** is the way that works everywhere: leave the auth key alone and open
**Liberty → Tailscale**, tab **Logs**. `tailscaled` prints a login URL there. Open it
in a browser and approve the device.

> **The Auth Key field on the settings page does not work in this firmware.** It is
> part of **Custom Server Settings**, and its value never reaches `tailscale up`:
> the LuCI page writes the option as `authKey` while the init script reads
> `authkey`, and UCI option names are case-sensitive. Typing a key there looks
> like it saved and changes nothing. This is an upstream defect in
> `luci-app-tailscale`, not a setting you got wrong.
>
> If you want to register with a key rather than a browser, put it in
> **Global Settings → Extra Settings → Additional Flags** as
> `--authkey=tskey-auth-…`. That field is read correctly and is passed straight to
> `tailscale up`. From the command line, `uci set tailscale.settings.authkey='…'`
> (all lower case) works too.

**Login Status** on the settings page then shows the device as connected.

## Step 3 — route all traffic through an exit node

Same page, sub-tab **Advanced Settings**:

![Tailscale advanced settings with exit node options](../img/liberty/tailscale-advanced.png)

*① sub-tab **Advanced Settings**. ② **Online Exit Nodes** — the "everything through
Tailscale" setting. ③ **Accept DNS** — turn it on together with ②. ④ **Save & Apply**.*

| Field | What it does |
|---|---|
| **Online Exit Nodes** | choose a machine to send **all** internet traffic through — this is the "everything through Tailscale" setting |
| **Exit Node** | offer *this dongle* as an exit node for your other machines — the opposite direction |
| **Accept Routes** | accept subnets advertised by other nodes |
| **Accept DNS** | use the DNS configuration from the Tailscale admin console |
| **Expose Subnets** | advertise this dongle's LAN into your mesh |
| **Access Control** | `Tailscale access LAN` / `Tailscale access WAN` / `LAN access Tailscale` |

The list shows `No Available Exit Nodes` until at least one machine in your account
advertises itself as one — configure that on the machine, then re-open this page.

Turn on **Accept DNS** as well when using an exit node: otherwise names keep being
resolved through the modem while the traffic itself goes out elsewhere.

## Extra Settings — flags and a private server

Same page, sub-tab **Extra Settings**, which holds the two things the other tabs
have no field for:

![Tailscale extra settings](../img/liberty/tailscale-extra.png)

*① sub-tab **Extra Settings**. ② **Additional Flags** — one flag per entry, the
green **+** adds another. ③ **Server Address** and ④ **Auth Key** of **Custom Server
Settings** — for a self-hosted headscale; leave both empty for normal Tailscale.*

- **Additional Flags** — anything `tailscale up` accepts that has no checkbox of
  its own, one entry per flag, in `--flag=value` form (the field's own example is
  `--exit-node=10.0.0.1`). Use this only for options the Basic and Advanced tabs
  do not already cover — a flag set here and a checkbox set there can contradict
  each other.
- **Custom Server Settings** — **Server Address** and **Auth Key** point the dongle
  at a self-hosted [headscale](https://github.com/juanfont/headscale) control
  server instead of Tailscale's own. Leave both empty for normal Tailscale use.
  This block is shown on every sub-tab, so the same two fields appear under Basic
  Settings as well — it is one setting, not two. Mind the **Auth Key** defect
  described in Step 2.

## Step 4 — the kill-switch

**Do not build the wrapper and the zone by hand.** Unlike OpenVPN, Tailscale sets
all of that up itself on **Save & Apply**: an interface named `tailscale` over
`tailscale0`, a firewall zone of the same name with masquerading and MSS clamping
already switched on, and the forwardings its **Access Control** field asks for —
including `lan ⇒ tailscale`. A second interface and a second zone over the same
device would only compete with those.

Your half is the other one:

1. **Network → Firewall → General Settings → Zones**, **Edit** on the **lan** row,
   and in **Allow forward to destination zones** remove **wan**. Leave `tailscale`
   selected — the app put it there. **Save**, then **Save & Apply**.
2. Add the DNS rule from
   [Step 4 of the kill-switch guide](kill-switch.md#step-4--close-the-dns-leak) —
   **Network → Firewall → Traffic Rules → Add**. Without it name resolution
   survives the tunnel going down.

Carry firewall edits through to **Save & Apply** every time. Whenever its helper
hits an error, Tailscale reverts every *uncommitted* change to `network`,
`firewall` and `dhcp` — anything left merely saved can vanish under you.

> **Using an exit node? Then skip point 1 — it stops the service from starting.**
> With an exit node selected the app disables `lan ⇒ wan` itself, and to do that it
> first has to find it. If you have already removed the forwarding, the search
> comes back empty, the helper reads that as a failure and reverts and stops
> itself — in a loop, until procd gives up. Pick one: remove `lan ⇒ wan` yourself
> for mesh use, or select an exit node and let the app do it. Never both.

The router itself keeps its `wan` access, which is deliberate — that is how
`tailscaled` reaches the control server.

> **Which mode protects what.** Without an exit node Tailscale is a mesh between
> your own machines: the kill-switch above holds, but no internet traffic goes
> through Tailscale in the first place, so there is little to protect. With an exit
> node there is — but then the kill-switch is the app's own, and it is fail-open:
> stopping Tailscale puts `lan ⇒ wan` **back**, at the exact moment you needed it
> gone. Neither mode gives you a fail-closed "everything through Tailscale" by the
> steps above.

## Verifying

**Liberty → Tailscale**, tab **Interface Info** lists the `tailscale0` interface and
the addresses assigned to it. With an exit node selected, check the public address
from a device behind the dongle — it should be the exit node's.
