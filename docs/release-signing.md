# Release signing

- Every FARR Q Charge APK is signed with one permanent key, so new versions install over old ones and keep the data.
- The key is in `signing/farrq-release.jks.enc`, encrypted with AES-256 (PBKDF2, 200 000 rounds). Without the password it is useless, so it is safe in a public repo.
- The password is stored once as the GitHub Actions secret **`FARRQ_SIGNING_PASS`**. Alias `farrq`; the keystore and key password are the same value.
- The owner keeps an offline copy of `farrq-release.jks` and the password. **Never regenerate the key**: a new key means every phone must uninstall (and lose its data) to update.

## Add the secret (once)

1. Open https://github.com/esp32alegriff-bit/farr-q-charge-apk/settings/secrets/actions
2. Tap **New repository secret**.
3. Name: `FARRQ_SIGNING_PASS`
4. Secret: the password from the owner's offline copy.
5. Tap **Add secret**.

## Build a release

- Push to `main`: Actions builds the APK (Actions tab → latest run → Artifacts).
- Every signed push to `main` publishes (or refreshes) the GitHub Release named after `versionName` in `app/build.gradle.kts`.
- Without the secret, Actions only builds a `TEST-ONLY` debug APK, which cannot update a released install.
