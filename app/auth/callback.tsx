import { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";

export default function AuthCallback() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function handle() {
      if (!code) {
        setStatus("error");
        setErrorMessage("No confirmation code found in the link.");
        return;
      }

      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        setStatus("error");
        setErrorMessage(error.message);
        return;
      }

      setStatus("success");
      setTimeout(() => {
        router.replace("/");
      }, 1200);
    }
    handle();
  }, [code]);

  return (
    <View style={styles.container}>
      {status === "loading" && (
        <>
          <ActivityIndicator size="large" />
          <Text style={styles.text}>Confirming your account...</Text>
        </>
      )}
      {status === "success" && (
        <Text style={styles.text}>You're all set! Redirecting...</Text>
      )}
      {status === "error" && (
        <>
          <Text style={styles.errorText}>Something went wrong.</Text>
          <Text style={styles.text}>{errorMessage}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  text: {
    fontSize: 16,
    textAlign: "center",
  },
  errorText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#d32f2f",
  },
});
