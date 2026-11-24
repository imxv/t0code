import { sign as signApplication, type SignOptions } from "@electron/osx-sign";

export default async function sign(options: SignOptions): Promise<void> {
  const keychain = process.env.T3CODE_DESKTOP_LOCAL_SIGNING_KEYCHAIN;
  // An Apple-issued identity gives the build a team partition, so the keychain keeps trusting
  // each rebuild; the self-signed fallback is trusted per build (cdhash) only.
  const appleIdentity = process.env.T3CODE_DESKTOP_LOCAL_SIGNING_IDENTITY;
  const localIdentity =
    options.identity !== "-"
      ? undefined
      : appleIdentity
        ? { identity: appleIdentity }
        : keychain
          ? { identity: "T3 Code Local Updates", keychain }
          : undefined;
  await signApplication({
    ...options,
    ...(localIdentity
      ? {
          ...localIdentity,
          identityValidation: false,
          preAutoEntitlements: false,
          optionsForFile: (file, defaults) => ({
            ...options.optionsForFile?.(file, defaults),
            timestamp: "none",
          }),
        }
      : {}),
    batchCodesignCalls: true,
  });
}
