# Manual testing

1. Open `/?account=profile`, continue anonymously, and verify the same user remains after refresh.
2. Close and reopen a tab/browser on the same apex origin and verify the same user remains.
3. Link or continue with Google and verify return to `/?account=profile&auth=callback`.
4. Confirm sign-out clears account DOM, bookmark state, and preferences.
5. Confirm Reader and Landing account links navigate without a document reload.
