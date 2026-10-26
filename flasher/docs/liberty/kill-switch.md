# Never leak: kill-switch and DNS

[← All Liberty guides](README.md) · **English** · [Русский](kill-switch.ru.md)

This is the common part for **every Liberty application that carries your traffic** —
AmneziaWG, WireGuard, OpenVPN, Tailscale and PassWall. Do it once, and traffic from
your devices cannot leave through the modem even for a moment: not when the tunnel
drops, not while it is reconnecting, not before it comes up after a reboot.

The shape differs slightly per application, so start from the right row:

| Application | What the kill-switch is there | Steps |
|---|---|---|
| [AmneziaWG](amneziawg.md), [WireGuard](wireguard.md) | a zone over the tunnel interface, and `lan ⇒ vpn` in place of `lan ⇒ wan` | 2 → 3 → 4 |
| [OpenVPN](openvpn.md) | the same, but its `tun0` device has to be wrapped in an interface first | 1 → 2 → 3 → 4 |
| [Tailscale](tailscale.md) | the app builds the interface, the zone and `lan ⇒ tailscale` itself — all you do is take `lan ⇒ wan` away, and **not** if you use an exit node | [its Step 4](tailscale.md#step-4--the-kill-switch), then 4 |
| [PassWall](passwall.md) | `lan ⇒ wan` is removed and **nothing** put in its place — it is a proxy, not a route | [its Step 4](passwall.md#step-4--the-kill-switch), then 4 |
| [Zapret](zapret.md) | none — and none is possible | — |

Zapret is the one exception, and not because it was overlooked: it is not a tunnel.
Your traffic goes out through the modem by design, just reshaped, so removing the
`lan ⇒ wan` forwarding protects nothing — it only disconnects you.

**Step 4 applies to all five.** Routing and name resolution leak separately, and
closing one does not close the other.

## The idea

OpenWrt does not decide "VPN or not" per packet. It groups interfaces into **zones**
and allows traffic between them with **forwardings**. Out of the box there is
exactly one:

```
lan  ⇒  wan
```

That is why your devices reach the internet through the modem. A kill-switch is not
an extra rule that blocks something — it is the **absence** of that forwarding. Send
`lan` to the tunnel zone instead, and there is simply no path to the modem for
forwarded traffic. Nothing to fail, nothing to race.

Everything below happens on one page: **Network → Firewall**, tab **General
Settings**, except the DNS rule of Step 4, which lives on the **Traffic Rules** tab
of that same page.

![Firewall zone settings, showing the single lan ⇒ wan forwarding](../img/liberty/firewall-zones.png)

*① **Add** — creates the tunnel zone (Step 2). ② **Edit** on the **lan** row — where
the forwarding is moved (Step 3); the `⇒ wan` badge next to `lan` is that forwarding.
③ the **Traffic Rules** tab — where the DNS rule of Step 4 goes.*

## Step 1 — give the tunnel an interface

Skip this for AmneziaWG and WireGuard: they *are* interfaces, created in
**Network → Interfaces**, so they already exist. This step is for OpenVPN, which
creates a raw `tun0` device that the firewall knows nothing about — see the
[OpenVPN guide](openvpn.md#step-3--let-openwrt-see-the-tunnel).

Skip it for Tailscale too, but for the opposite reason: it also creates a raw
`tailscale0`, and then wraps it in an interface and a zone **by itself**. Wrapping
it a second time by hand only builds a rival interface over the same device — see
[its Step 4](tailscale.md#step-4--the-kill-switch).

## Step 2 — create a zone for the tunnel

**Network → Firewall**, tab **General Settings**, section **Zones**, button **Add**
(① in the screenshot). A dialog opens:

| Field | Value | Why |
|---|---|---|
| Name | `vpn` | any name; it is referenced by the forwarding below |
| Input | `reject` | nothing from the tunnel may reach the router itself |
| Output | `accept` | the router may send into the tunnel |
| Forward | `reject` | traffic arriving from the tunnel is not forwarded onward |
| Masquerading | **on** | the far end sees one address, not your private subnet |
| MSS clamping | **on** | without it, large packets vanish silently — see the note below |
| Covered networks | your tunnel interface | `vpn`, `awg0`, `wg0` — whatever you named it |

Leave **Allow forward to destination zones** and **Allow forward from source zones**
empty here; the next step creates the one forwarding you want. Press **Save** to
close the dialog — the zone is not written to the device until the **Save & Apply**
at the bottom of the page.

> **MSS clamping is not optional.** A tunnel has a smaller MTU than Ethernet.
> Without clamping, small requests succeed and large transfers stall — pages half
> load, downloads freeze at a few kilobytes. It looks like a broken VPN and is
> genuinely hard to diagnose, so switch it on from the start.

## Step 3 — move the forwarding

Still on **Network → Firewall → General Settings → Zones**, press **Edit** on the
**lan** row (② in the screenshot). In **Allow forward to destination zones**,
select **vpn** and **remove wan**. **Save**, then **Save & Apply**.

This single change is the kill-switch. Do not add `vpn` while leaving `wan` — with
both, traffic falls back to the modem the moment the tunnel is down, and you will
not notice.

> **From the command line, `uci commit` is not enough.** The change only takes
> effect once the firewall is reloaded: until then the rules still say
> `jump accept_to_wan` and traffic keeps going around the tunnel, even though
> `uci show firewall` looks correct. Run `/etc/init.d/firewall reload` after
> committing. LuCI's **Save & Apply** does this for you, so the steps above are
> unaffected.

## Step 4 — close the DNS leak

Routing is now watertight, but name resolution is not. The router's own resolver
talks to the operator's DNS servers through `wan`, and it does so on behalf of your
devices. The addresses you visit are visible even though the traffic itself is not.

Name resolution leaks along two separate paths, and closing one does not close the
other. Both halves below are needed.

### 4a — stop the router asking in the clear

**Already done for you.** A fresh flash carries a traffic rule that forbids the
**router itself** from sending ordinary DNS out through the modem, and it sets
the two DoH resolvers to their address form (`https://1.1.1.1/dns-query`,
`https://8.8.8.8/dns-query`) so that nothing needs port 53 to start in the first
place. The two go together and the order is not optional: `https-dns-proxy` looks
its endpoint name up on port 53 exactly once while starting, and a rule that
blocks that lookup leaves you with no DNS at all after every reboot.

To confirm: **Network → Firewall**, tab **Traffic Rules** (③ in the screenshot),
a rule named `Block-DNS-leak-via-wan`.

If it is missing — deleted by hand, or an image older than this guide — press
**Add** at the bottom of the rule list and fill the dialog in (and change the
resolver URLs first, under **Services → HTTPS DNS Proxy**):

| Field | Value |
|---|---|
| Name | `Block-DNS-leak-via-wan` |
| Protocol | **TCP** and **UDP** — already the default for a new rule |
| Source zone | **Device (output)** — that entry means the router's own traffic |
| Destination zone | `wan` |
| Destination port | `53 853` |
| Action | **reject** |

Leave the address fields empty. **Save**, then **Save & Apply**.

From the command line:

```sh
uci set firewall.dnsleakguard=rule
uci set firewall.dnsleakguard.name='Block-DNS-leak-via-wan'
uci set firewall.dnsleakguard.dest='wan'
uci set firewall.dnsleakguard.proto='tcp udp'
uci set firewall.dnsleakguard.dest_port='53 853'
uci set firewall.dnsleakguard.target='REJECT'
uci commit firewall && /etc/init.d/firewall reload
```

**Why this and not the obvious `lan ⇒ wan` port-53 rule.** Blocking DNS *from the
LAN* does nothing: the router intercepts port 53 in `prerouting` and answers it
itself, so your devices' queries never become forwarded packets at all. What
leaks is the *router's* own upstream lookup, and that is what has to be stopped.

**Why it does not break anything.** While the tunnel is up, DNS is handled
inside it (or handed to the proxy) and never reaches the `wan` output chain, so
the rule never matches. The moment the tunnel drops, a resolver that falls back
to plain DNS hits this rule and stops — instead of quietly continuing.

> **What this rule does not cover.** It closes plaintext DNS and DoT (port 853).
> It does not close **DoH**, which rides ordinary HTTPS on port 443 and is
> indistinguishable from any other web request. There is one exception, and it
> is the trap described above rather than a feature: a resolver that has not yet
> looked its endpoint up is stopped by this rule and stays stopped. Once it is
> running it keeps answering over 443 no matter what happens to your tunnel, and
> this rule never sees a packet of it. That is what 4b is for.
>
> The rule still earns its place: it is what catches `dnsmasq` if
> `https-dns-proxy` is ever stopped, because `dnsmasq` then falls straight back
> to the operator's resolver and the names go out **in the clear**. So do not
> "simplify" this by switching `https-dns-proxy` off — that makes things worse.

### 4b — make encrypted DNS die with the tunnel

`https-dns-proxy` keeps answering no matter what happens to your tunnel. It never
needs ordinary DNS to get going: the resolver addresses are handed to it directly
on its command line (`-b 1.1.1.1,1.0.0.1`), so it opens its HTTPS session without
looking anything up first. The kill-switch cannot reach it either — these are the
router's own packets, not forwarded ones. Stop the tunnel and your devices keep
resolving names from the router's real address: the *content* of your traffic
stays protected, the *list of names you visit* does not.

The fix is to tie the resolver to whatever carries your traffic, so it fails when
that fails.

**For a tunnel — AmneziaWG, WireGuard, OpenVPN, Tailscale — this is automatic.**
The firmware watches for tunnel interfaces coming up and binds the resolver's
outgoing socket to that tunnel's own address. When the tunnel goes, the address
goes with it, the socket cannot be bound and every lookup fails. It rebinds by
itself on the next connection, at whatever address the tunnel gets then. Nothing
to configure; `logread | grep dns-bind-tunnel` shows it happening.

**For PassWall you set it once, by hand.** Its equivalent is sending the resolver
through the proxy itself, and that cannot ship as a default: on a device not
running PassWall it would point the resolver at a port with nothing behind it and
leave you with no DNS at all.

Switch the SOCKS listener on first — **Liberty → PassWall → Basic Settings →
Main**, field **TCP Node Socks Listen Port** (1070 by default), leaving **Bind
Local** on. Then **Services → HTTPS DNS Proxy**, field **Proxy Server**:

```
socks5://127.0.0.1:1070
```

or from the command line:

```sh
uci set https-dns-proxy.config.proxy_server='socks5://127.0.0.1:1070'
uci commit https-dns-proxy && /etc/init.d/https-dns-proxy restart
```

When PassWall stops, nothing is listening there any more and resolution stops
with it.

Either way the daemon stays running and simply stops getting answers. `dnsmasq`
has nowhere else to go, so resolution fails closed rather than falling back to
something worse.

## Step 5 — verify it actually holds

Do not trust the configuration, verify it:

1. With the tunnel up, check that your public address is the tunnel's.
2. **Stop the tunnel** — **Network → Interfaces → Stop** for AmneziaWG and
   WireGuard, **Liberty → OpenVPN → stop** for OpenVPN, **Liberty → Tailscale →
   Global Settings → Basic Settings**, clear **Enable** for Tailscale,
   **Liberty → PassWall → Basic Settings → Main**, clear **Main switch** for PassWall.
3. From a device behind the dongle, open any site. It must fail. If anything loads,
   the `lan ⇒ wan` forwarding is still there.
4. Still with the tunnel stopped, resolve a name you have never visited before —
   `nslookup www.videolan.org` from that same device. It must fail too. If it
   answers, Step 4b is not in place: routing is closed, but the names you look up
   are still going out.
5. Start it again and confirm traffic returns.

## What is deliberately still allowed

The **router itself** keeps its access to `wan`. It has to: that is how the VPN
client reaches its server. The steps above only change what happens to *forwarded*
packets — the ones from your devices. This is the correct behaviour, not a leak.
