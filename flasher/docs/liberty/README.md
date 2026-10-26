# Liberty applications — setup guides

**English** · [Русский](README.ru.md)

Every anti-censorship, VPN and proxy application shipped with OpenWrt-Liberty lives
under one top-level **Liberty** menu in LuCI. This directory holds a separate guide
for each of them.

## The applications are not interchangeable

They fall into three groups, and "send all traffic through it" means something
different in each. Reading this table first will save you an hour.

| Application | What it is | Configured in | Can carry all traffic? | Kill-switch |
|---|---|---|---|---|
| [**AmneziaWG**](amneziawg.md) | WireGuard with obfuscation, resists DPI | Network → Interfaces (the Liberty entry is status only) | Yes — a routed tunnel | [yes](kill-switch.md) |
| [**WireGuard**](wireguard.md) | plain WireGuard | Network → Interfaces (the Liberty entry is status only) | Yes — a routed tunnel | [yes](kill-switch.md) |
| [**OpenVPN**](openvpn.md) | classic VPN client | Liberty → OpenVPN | Yes — a routed tunnel | [yes](kill-switch.md) |
| [**PassWall**](passwall.md) | xray-core front end (VLESS, Reality, XHTTP…) | Liberty → PassWall | Yes — but by intercepting traffic, not by routing it | [yes, in its own form](passwall.md#step-4--the-kill-switch) |
| [**Tailscale**](tailscale.md) | zero-configuration mesh VPN | Liberty → Tailscale | Only through an **exit node** | [yes](tailscale.md#step-4--the-kill-switch) |
| [**Zapret**](zapret.md) | DPI circumvention without any server | Liberty → Zapret | **No** — it is not a tunnel at all | not applicable |

The first three are ordinary network interfaces: the kernel routes packets into
them, and the firewall decides who may use them. PassWall works differently — it
hijacks connections with nftables and hands them to xray-core rather than becoming
a route — but **the kill-switch still applies to it**, and in the same form:
remove the `lan ⇒ wan` forwarding, just without pointing `lan` at a tunnel zone
instead. See the [PassWall guide](passwall.md#step-4--the-kill-switch).
Tailscale builds a mesh between your own machines; internet traffic goes
through it only if one of those machines is set as an exit node — and it takes the
kill-switch exactly like OpenVPN does. Zapret does not move traffic anywhere — it
mangles packets so that a DPI box fails to classify them, which is why it is the
one application here with no kill-switch to set up.

## Guides

- [**Never leak: kill-switch and DNS**](kill-switch.md) — the common part for every
  application that carries traffic: AmneziaWG, WireGuard, OpenVPN, Tailscale and
  PassWall. Read it once; each guide links back to it. Zapret is the only one it
  does not apply to, and that guide says why.
- [AmneziaWG](amneziawg.md)
- [WireGuard](wireguard.md)
- [OpenVPN](openvpn.md)
- [PassWall](passwall.md)
- [Tailscale](tailscale.md)
- [Zapret](zapret.md)

## Before you start

The dongle's web interface is at **http://192.168.1.1** over the USB gadget — the
same address whether you reach it from the USB host or over Wi-Fi. Management never
depends on the modem, so an experiment that breaks the internet connection will not
lock you out.

A tunnel needs a working upstream first. If the modem has no SIM or no data
connection, every VPN client will simply retry forever — `Network unreachable` in
the log means the problem is the modem, not the VPN.
