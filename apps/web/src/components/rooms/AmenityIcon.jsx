import { BedDouble, Coffee, Laptop, Leaf, ShowerHead, Thermometer, Trees, Wifi, Check } from "lucide-react";

const MAP = { BedDouble, Coffee, Laptop, Leaf, ShowerHead, Thermometer, Trees, Wifi };

export default function AmenityIcon({ name, size = 20 }) {
  const Icon = MAP[name] || Check;
  return <Icon size={size} strokeWidth={1.25} aria-hidden="true" />;
}
