import androidPhoneIcon from "@/assets/devices/android-phone.svg";
import androidTabletIcon from "@/assets/devices/android-tablet.svg";
import ipadIcon from "@/assets/devices/ipad.svg";
import iphoneIcon from "@/assets/devices/iphone.svg";
import macIcon from "@/assets/devices/mac.svg";
import unknownDeviceIcon from "@/assets/devices/unknown-device.svg";
import windowsIcon from "@/assets/devices/windows.svg";

const deviceIconMap = {
  mac: macIcon,
  windows: windowsIcon,
  iphone: iphoneIcon,
  ipad: ipadIcon,
  "android-phone": androidPhoneIcon,
  "android-tablet": androidTabletIcon,
  "unknown-device": unknownDeviceIcon
};

export function classifyDeviceFamily(device = {}) {
  const label = normalizeText(device.device_label || device.name || device.label);
  const os = normalizeText(device.os);
  const browser = normalizeText(device.browser);
  const combined = `${label} ${os} ${browser}`.toLowerCase();

  if (combined.includes("iphone")) return "iphone";
  if (combined.includes("ipad") || combined.includes("ipados")) return "ipad";
  if (combined.includes("android")) {
    return combined.includes("tablet") || combined.includes("pad") ? "android-tablet" : "android-phone";
  }
  if (
    combined.includes("mac") ||
    combined.includes("macos") ||
    combined.includes("macbook") ||
    combined.includes("imac")
  ) {
    return "mac";
  }
  if (
    combined.includes("windows") ||
    combined.includes("pc") ||
    combined.includes("laptop") ||
    combined.includes("desktop")
  ) {
    return "windows";
  }

  return "unknown-device";
}

export function getDeviceIconSource(device = {}) {
  return deviceIconMap[classifyDeviceFamily(device)] || deviceIconMap["unknown-device"];
}

function normalizeText(value) {
  return String(value ?? "").trim();
}
