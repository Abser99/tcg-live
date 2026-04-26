import { StyleSheet } from 'react-native';
import { colors, spacing, radius, font } from './index';

export const authStyles = StyleSheet.create({
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: font.base,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md + 2,
    alignItems: 'center' as const,
    marginTop: spacing.sm,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.white, fontSize: font.base, fontWeight: '700' as const },
  link: { color: colors.textMuted, textAlign: 'center' as const, fontSize: font.md },
  linkAccent: { color: colors.primaryLight, fontWeight: '600' as const },
});
