// OAuth adapter: preserve returned Supabase session errors for the caller.

import { createLovableAuth } from "@lovable.dev/cloud-auth-js";
import type { OAuthProvider } from "@lovable.dev/cloud-auth-js";
import { supabase } from "../supabase/client";
const lovableAuth = createLovableAuth();

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

export const lovable = {
  auth: {
    signInWithOAuth: async (provider: OAuthProvider, opts?: SignInOptions) => {
      try {
        const result = await lovableAuth.signInWithOAuth(provider, {
          ...opts,
          extraParams: {
            ...opts?.extraParams,
          },
        });

        if (result.redirected) {
          return result;
        }

        if (result.error) {
          return result;
        }

        const { error } = await supabase.auth.setSession(result.tokens);
        if (error) return { error };
        return result;
      } catch (e) {
        return { error: e instanceof Error ? e : new Error(String(e)) };
      }
    },
  },
};
