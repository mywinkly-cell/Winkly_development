// apps/mobile/app/wishlist/edit.tsx
// Edit a saved place (route param: id).

import React, { useEffect, useState } from "react";
import { View, Alert, ActivityIndicator, Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Header, Screen, PrimaryButton, TextButton } from "@/components/ds";
import { useAppTheme } from "@/constants/design-system";
import { WishlistForm, type WishlistFormValues } from "@/components/wishlist/WishlistForm";
import { useModeContext } from "@/providers/ModeContextProvider";
import { getWishlistItem, updateWishlistItem } from "@/lib/wishlistStore";

export default function WishlistEdit() {
  const router = useRouter();
  const theme = useAppTheme();
  const { t } = useTranslation();
  const { context } = useModeContext();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [values, setValues] = useState<WishlistFormValues | null>(null);
  const [missing, setMissing] = useState(false);
  const [titleError, setTitleError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getWishlistItem(String(id))
      .then((found) => {
        if (cancelled) return;
        if (!found) {
          setMissing(true);
          return;
        }
        setValues({
          title: found.title,
          sourceUrl: found.sourceUrl ?? found.url ?? "",
          address: found.address ?? "",
          city: found.city ?? "",
          description: found.description ?? "",
          price: found.price ?? "",
          sharedModes: found.sharedModes,
          latitude: found.latitude,
          longitude: found.longitude,
          placeId: found.placeId,
          imageUrl: found.imageUrl,
        });
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const onSave = async () => {
    if (!values) return;
    if (!values.title.trim()) {
      setTitleError(t("wishlist.nameRequired"));
      return;
    }
    setSaving(true);
    try {
      const updated = await updateWishlistItem(String(id), {
        title: values.title,
        description: values.description,
        price: values.price,
        address: values.address,
        city: values.city,
        sourceUrl: values.sourceUrl,
        latitude: values.latitude,
        longitude: values.longitude,
        sharedModes: values.sharedModes,
      });
      if (!updated) {
        setMissing(true);
        return;
      }
      router.replace({ pathname: "/wishlist/details", params: { id: updated.id } });
    } catch {
      Alert.alert(t("catalog.saveFailedTitle"), t("catalog.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Header
        onBack
        title={t("wishlist.editTitle")}
        trailing={values ? <TextButton title={t("common.save")} onPress={onSave} disabled={saving} /> : undefined}
      />
      {missing ? (
        <View style={{ padding: theme.spacing.xl }}>
          <Text style={[theme.type.body, { color: theme.colors.textSecondary }]}>{t("wishlist.notFound")}</Text>
        </View>
      ) : !values ? (
        <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: theme.spacing.xxl }} />
      ) : (
        <Screen>
          <View style={{ height: theme.spacing.lg }} />
          <WishlistForm
            values={values}
            onChange={(v) => {
              setValues(v);
              if (titleError && v.title.trim()) setTitleError(undefined);
            }}
            availableModes={context.permissions}
            titleError={titleError}
          />
          <PrimaryButton
            title={t("common.save")}
            onPress={onSave}
            loading={saving}
            disabled={saving}
            style={{ marginTop: theme.spacing.lg }}
          />
        </Screen>
      )}
    </View>
  );
}
