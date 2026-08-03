import { View, Text, Image, StyleSheet } from "react-native";
import { colors } from "@/lib/theme";

interface Props {
  name?: string | null;
  photoUrl?: string | null;
  size?: number;
}

/** Round avatar: shows the photo when present, otherwise initials on the accent color. */
export function Avatar({ name, photoUrl, size = 44 }: Props) {
  const dims = { width: size, height: size, borderRadius: size / 2 };
  if (photoUrl) {
    return <Image source={{ uri: photoUrl }} style={[styles.base, dims]} />;
  }
  return (
    <View style={[styles.base, styles.fallback, dims]}>
      <Text style={[styles.text, { fontSize: size * 0.4 }]}>{initials(name)}</Text>
    </View>
  );
}

function initials(name?: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

const styles = StyleSheet.create({
  base: { backgroundColor: colors.card },
  fallback: { backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  text: { color: "#fff", fontWeight: "700" },
});
