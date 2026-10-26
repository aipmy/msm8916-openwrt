# OpenVPN

[← All Liberty guides](README.md) · **English** · [Русский](openvpn.ru.md)

Classic VPN client. OpenWrt runs it as a service that creates a `tun0` device; the
firewall has to be told about that device separately, which is the step people
usually miss.

## Step 1 — load the provider's configuration

**Liberty → OpenVPN**, section **OVPN configuration file upload** at the bottom of
the page.

![OpenVPN instance list with the upload form](../img/liberty/openvpn-overview.png)

*Step 1: ① **Instance name** — a name for the connection. ② **Choose File** — your
`.ovpn`. ③ **Upload**. Step 2: ④ **Enabled** on the new row, ⑤ **Save & Apply**,
⑥ **start**.*

The instance appears in the list above with **Enabled** unchecked.

If your provider gave you certificates as separate files rather than one `.ovpn`,
put them in `/etc/openvpn/` first and reference them by path — the
**Template based configuration** section just above the upload form creates an
instance you can then edit field by field.

## Step 2 — start it and confirm the tunnel is up

On the same page: tick **Enabled** on the instance's row, press **Save & Apply**,
then **start** in the **Start/Stop** column.

The **Started** column should show `yes` with a process id. That only means the
service is running — it does not mean the tunnel connected. Check
**Status → System Log** and look for `Initialization Sequence Completed`. Two
messages mean it did not work:

- `Network unreachable` — the dongle has no internet at all. Fix the modem first;
  OpenVPN is not the problem.
- `TLS handshake failed` — the server is reachable but rejects the connection:
  wrong certificates, wrong time on the dongle, or the provider is blocking.

## Step 3 — let OpenWrt see the tunnel

OpenVPN creates `tun0` itself, but netifd does not know about it, so no firewall
zone can reference it. Create an interface that wraps the existing device:

**Network → Interfaces**, button **Add new interface…** at the bottom of the list.

![The Add new interface dialog](../img/liberty/interfaces-add.png)

*① **Name** — `vpn`. ② **Protocol** — **Unmanaged**; a **Device** field appears
below it once you pick it (the screenshot shows the dialog with another protocol
selected). ③ **Create interface**.*

| Field | Value |
|---|---|
| Name | `vpn` |
| Protocol | **Unmanaged** |
| Device | `tun0` |

Press **Create interface**, then **Save** in the dialog that opens. Do not assign a
firewall zone in that dialog — the next step does that deliberately.

> **From the command line the interface must also be brought up.** Writing the
> section with `uci` and committing is not enough: until `/etc/init.d/network
> reload` **and** `ifup vpn` have run, netifd does not register it and `tun0`
> ends up in **no firewall zone at all** — the zone is empty and forwarded
> traffic never reaches the tunnel. What makes this hard to spot is that the
> router's *own* traffic keeps working, so the tunnel looks healthy. LuCI's
> **Create interface** does this step for you.

> **Unmanaged** is right here: OpenVPN, not netifd, owns the device's addresses and
> routes. The interface exists purely so the firewall has something to point at.

## Step 4 — route everything through it, with no leaks

Follow [Never leak: kill-switch and DNS](kill-switch.md) — create the `vpn` zone
covering the interface you just made, and move the `lan` forwarding from `wan` to
`vpn`. Step 1 there is the interface you have just created, so continue from Step 2.

## Step 5 — make sure the default route is the tunnel

Most providers push `redirect-gateway def1` from the server, and then everything
already goes through the tunnel once it is up. Confirm from a device behind the
dongle that your public address changed.

If it did not, the server is not pushing a default route, and you add it yourself.
**Liberty → OpenVPN → Edit** on the instance's row leads to one of two different
pages, depending on how the instance was made:

- **Uploaded `.ovpn`** — **Edit** opens the file itself as text. Add a line
  `redirect-gateway def1`, press **Save**, then restart the instance
  (**stop**, **start**).
- **Template based or hand-made** — **Edit** opens a form. Follow
  **Switch to advanced configuration »** at the top, then **Configuration
  category: VPN**, and set **Automatically redirect default route** to `def1`.
  **Save & Apply**, then restart the instance.

> **If the tunnel is up and your address still has not changed, the routes are
> being wiped.** The interface from Step 3 hands `tun0` to netifd, and netifd
> clears routes OpenVPN put there itself. Measured on this firmware: the two halves
> of `def1` — `0.0.0.0/1` and `128.0.0.0/1` — appear when OpenVPN connects and
> are gone the moment the interface comes up. Traffic then goes out through the
> modem instead, which looks exactly like a working connection until you check
> the address. With the kill-switch in place it does not leak, but nothing
> reaches the internet either.
>
> The fix is to let netifd own the routes, so they belong to the interface and
> come back with it. **Network → Routing**, section **Static IPv4 Routes**,
> **Add** — twice, both on interface `vpn` with **Gateway** set to the tunnel's
> far-end address (the peer address OpenVPN reports for `tun0`):
>
> | Target | Netmask |
> |---|---|
> | `0.0.0.0` | `128.0.0.0` |
> | `128.0.0.0` | `128.0.0.0` |
>
> **Save & Apply**. From the command line:
>
> ```sh
> uci set network.vpnr1=route
> uci set network.vpnr1.interface='vpn'
> uci set network.vpnr1.target='0.0.0.0'
> uci set network.vpnr1.netmask='128.0.0.0'
> uci set network.vpnr1.gateway='10.8.0.1'   # your tunnel's far end
> uci set network.vpnr2=route
> uci set network.vpnr2.interface='vpn'
> uci set network.vpnr2.target='128.0.0.0'
> uci set network.vpnr2.netmask='128.0.0.0'
> uci set network.vpnr2.gateway='10.8.0.1'
> uci commit network && /etc/init.d/network reload && ifup vpn
> ```
>
> Two `/1` routes rather than one default: they beat the modem's default route
> without replacing it, so the OpenVPN client keeps its own path to the server.

## Known quirk in this firmware

On the form pages, the file-browse button next to certificate and key paths opens a
page that does not exist — LuCI dropped the legacy CBI file browser, while the
OpenVPN app still links to it. Type the path in by hand instead; the field itself
works normally.
