import { Tabs } from "expo-router";
import { Text } from "react-native";
import { useTranslation } from "react-i18next";
import { colors } from "@/lib/theme";

// Simple text glyph tab icons keep the scaffold dependency-free.
function icon(glyph: string) {
  return ({ color }: { color: string }) => (
    <Text style={{ color, fontSize: 20 }}>{glyph}</Text>
  );
}

export default function TabsLayout() {
  const { t } = useTranslation();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        headerStyle: { backgroundColor: colors.bg },
        headerTitleStyle: { color: colors.text },
      }}
    >
      <Tabs.Screen
        name="discover"
        options={{ title: t("tabs.discover"), tabBarIcon: icon("✨") }}
      />
      <Tabs.Screen
        name="directory"
        options={{ title: t("tabs.directory"), tabBarIcon: icon("👥") }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: t("tabs.profile"), tabBarIcon: icon("👤") }}
      />
    </Tabs>
  );
}
