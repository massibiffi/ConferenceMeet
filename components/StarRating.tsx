import { View, Text, Pressable, StyleSheet } from "react-native";
import { colors } from "@/lib/theme";

interface Props {
  value: number | null; // 1..5 or null
  onChange: (value: number) => void;
  size?: number;
}

/** Five tappable stars. Tapping the current rating again clears it (sets 0 -> null upstream). */
export function StarRating({ value, onChange, size = 28 }: Props) {
  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = (value ?? 0) >= n;
        return (
          <Pressable key={n} onPress={() => onChange(n)} hitSlop={6}>
            <Text style={[styles.star, { fontSize: size, color: filled ? colors.accent : colors.border }]}>
              {filled ? "★" : "☆"}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 4 },
  star: { fontWeight: "700" },
});
