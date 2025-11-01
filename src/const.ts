// إعادة تصدير القيم المشتركة لو موجودة
export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// عنوان التطبيق
export const APP_TITLE = import.meta.env.VITE_APP_TITLE || "Security Map";

// شعار التطبيق
export const APP_LOGO =
  import.meta.env.VITE_APP_LOGO ||
  "/logo.png"; // صورة محلية أفضل من رابط خارجي

// ⚠️ مهم: رسالة الخطأ المطلوبة في main.tsx
export const UNAUTHED_ERR_MSG = "UNAUTHED";

// عنوان تسجيل الدخول
export const getLoginUrl = () => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;

  // إن لم يُضبط OAuth بعد → رجّع المستخدم لصفحة رئيسية أو Dashboard
  if (!oauthPortalUrl || !appId) {
    console.warn(
      "[WARN] VITE_OAUTH_PORTAL_URL or VITE_APP_ID missing — using fallback login URL"
    );
    return "/";
  }

  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};
