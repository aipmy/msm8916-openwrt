include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-sms
LUCI_TITLE:=Modem messaging (archive, threads, USSD, forwarding)
LUCI_DESCRIPTION:=Mailbox-style interface for cellular modem messaging via ModemManager.
LUCI_PKGARCH:=all
LUCI_DEPENDS:=+modemmanager +luci-proto-modemmanager +dbus-utils
PKG_VERSION:=1.0
PKG_RELEASE:=1

define Package/luci-app-sms/conffiles
/etc/config/sms
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
