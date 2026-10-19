/*
 * SPDX-License-Identifier: GPL-2.0-only
 *
 * reboot-mode-raw.c - Low-level syscall dispatcher for Qualcomm MSM reboot modes
 */

#include <unistd.h>
#include <sys/syscall.h>
#include <linux/reboot.h>
#include <errno.h>
#include <stdio.h>
#include <string.h>

int main(int argc, char *argv[])
{
	const char *cmd = "edl";

	if (argc > 1 && (!strcmp(argv[1], "-h") || !strcmp(argv[1], "--help"))) {
		printf(
"Usage: %s [edl|dload|bootloader|recovery]\n"
"       %s -h|--help\n"
"\n"
"Reboot straight into a Qualcomm target mode (default: edl).\n"
"\n"
"Modes:\n"
"  edl          9008 PBL Emergency Download\n"
"  dload        9006 SBL1 mass-storage / dump\n"
"  bootloader   fastboot\n"
"  recovery     recovery\n"
"\n"
"Options:\n"
"  -h, --help   Show this help and exit\n"
"\n"
"Most users want the wrapper: reboot-mode (see reboot-mode --help).\n",
			argv[0], argv[0]);
		return 0;
	}

	if (argc > 1 && argv[1][0] != '\0')
		cmd = argv[1];

	sync();

	/*
	 * Dispatch Linux RESTART2 with Qualcomm target mode parameter:
	 *   - "edl"        -> 9008 PBL Emergency Download
	 *   - "dload"      -> 9006 SBL1 Mass Storage / Dump
	 *   - "bootloader" -> fastboot
	 *   - "recovery"   -> recovery
	 */
	long ret = syscall(SYS_reboot,
			   LINUX_REBOOT_MAGIC1,
			   LINUX_REBOOT_MAGIC2,
			   LINUX_REBOOT_CMD_RESTART2,
			   cmd);

	fprintf(stderr, "reboot(%s) syscall returned: %ld (%s)\n",
		cmd, ret, strerror(errno));

	return 1;
}
