import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import { signInWithLinkedIn } from "@/lib/oauth";
import { colors, spacing } from "@/lib/theme";

export default function SignIn() {
  const { t } = useTranslation();
  const { signInWithEmail, signUpWithEmail } = useAuth();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [linkedinBusy, setLinkedinBusy] = useState(false);

  async function linkedIn() {
    setLinkedinBusy(true);
    const { error } = await signInWithLinkedIn();
    setLinkedinBusy(false);
    if (error) Alert.alert(t("auth.linkedInTitle"), error);
  }

  async function submit() {
    if (!email || !password) {
      Alert.alert(t("auth.missingTitle"), t("auth.missingBody"));
      return;
    }
    setBusy(true);
    const fn = mode === "in" ? signInWithEmail : signUpWithEmail;
    const { error } = await fn(email.trim(), password);
    setBusy(false);
    if (error) {
      Alert.alert(t("auth.errorTitle"), error);
    } else if (mode === "up") {
      Alert.alert(t("auth.checkEmailTitle"), t("auth.checkEmailBody"));
      setMode("in");
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.container}
      >
        <Text style={styles.brand}>ConferenceMeet</Text>
        <Text style={styles.tagline}>{t("auth.tagline")}</Text>

        <TextInput
          style={styles.input}
          placeholder={t("auth.email")}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder={t("auth.password")}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <Pressable style={styles.button} onPress={submit} disabled={busy}>
          <Text style={styles.buttonText}>
            {busy ? "..." : mode === "in" ? t("auth.signIn") : t("auth.createAccount")}
          </Text>
        </Pressable>

        <Pressable onPress={() => setMode(mode === "in" ? "up" : "in")}>
          <Text style={styles.switch}>
            {mode === "in" ? t("auth.toSignUp") : t("auth.toSignIn")}
          </Text>
        </Pressable>

        <View style={styles.dividerRow}>
          <View style={styles.divider} />
          <Text style={styles.dividerText}>{t("auth.or")}</Text>
          <View style={styles.divider} />
        </View>

        {/* LinkedIn doubles as the strongest cheap identity-verification signal. */}
        <Pressable
          style={styles.linkedInBtn}
          onPress={linkedIn}
          disabled={linkedinBusy}
        >
          <Text style={styles.linkedInText}>
            {linkedinBusy ? t("auth.openingLinkedIn") : t("auth.continueLinkedIn")}
          </Text>
        </Pressable>
        <Text style={styles.verifyHint}>{t("auth.linkedInHint")}</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  brand: { fontSize: 32, fontWeight: "800", color: colors.accent },
  tagline: { color: colors.muted, marginBottom: spacing.lg },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: spacing.md,
    fontSize: 16,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    padding: spacing.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  switch: { color: colors.accentDark, textAlign: "center", marginTop: spacing.md },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginVertical: spacing.sm },
  divider: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.muted },
  linkedInBtn: {
    backgroundColor: "#0A66C2", // LinkedIn brand blue
    borderRadius: 10,
    padding: spacing.md,
    alignItems: "center",
  },
  linkedInText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  verifyHint: { color: colors.muted, fontSize: 12, textAlign: "center" },
});

