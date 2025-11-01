import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { APP_LOGO, APP_TITLE, getLoginUrl } from "@/const";
import { Link } from "wouter";
import { MapPin, Users, Shield, Activity } from "lucide-react";

export default function Home() {
  const { user, loading, isAuthenticated, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50">
      {/* Header */}
      <header className="bg-white border-b border-amber-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Diriyah" className="w-10 h-10 rounded-full" />
            <h1 className="text-2xl font-bold text-amber-900">خريطة الدرعية</h1>
          </div>
          <div className="flex items-center gap-4">
            {isAuthenticated ? (
              <>
                <span className="text-gray-700">مرحباً، {user?.name || "المستخدم"}</span>
                <Button
                  onClick={logout}
                  variant="outline"
                  className="border-amber-600 text-amber-600 hover:bg-amber-50"
                >
                  تسجيل الخروج
                </Button>
              </>
            ) : (
              <Button
                onClick={() => (window.location.href = getLoginUrl())}
                className="bg-amber-600 hover:bg-amber-700"
              >
                تسجيل الدخول
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-4xl font-bold text-amber-900 mb-4">
              خريطة تفاعلية لإدارة مواقع الأمن والتنظيم المروري
            </h2>
            <p className="text-lg text-gray-700 mb-6">
              نظام متقدم لتتبع وإدارة مواقع تمركز أفراد الأمن والتنظيم المروري في منطقة الدرعية بكفاءة عالية.
            </p>
            <div className="flex gap-4">
              {isAuthenticated ? (
                <Link href="/map">
                  <Button className="bg-amber-600 hover:bg-amber-700 text-white px-8 py-3 text-lg">
                    <MapPin className="w-5 h-5 ml-2" />
                    الدخول إلى الخريطة
                  </Button>
                </Link>
              ) : (
                <Button
                  onClick={() => (window.location.href = getLoginUrl())}
                  className="bg-amber-600 hover:bg-amber-700 text-white px-8 py-3 text-lg"
                >
                  <MapPin className="w-5 h-5 ml-2" />
                  ابدأ الآن
                </Button>
              )}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-lg p-8 border-l-4 border-amber-600">
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <Shield className="w-6 h-6 text-amber-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold text-amber-900">إدارة آمنة</h3>
                  <p className="text-gray-600">تحكم كامل على مواقع التمركز والأفراد</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <MapPin className="w-6 h-6 text-amber-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold text-amber-900">خريطة تفاعلية</h3>
                  <p className="text-gray-600">عرض فوري لجميع المواقع على الخريطة</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <Users className="w-6 h-6 text-amber-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold text-amber-900">إدارة الأفراد</h3>
                  <p className="text-gray-600">تتبع الأفراد وبيانات التواصل</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <Activity className="w-6 h-6 text-amber-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold text-amber-900">مشاركة سهلة</h3>
                  <p className="text-gray-600">شارك المواقع عبر واتساب أو إيميل</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="bg-white py-16 border-t border-amber-200">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-amber-900 mb-12 text-center">
            المميزات الرئيسية
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-6 border border-amber-200 rounded-lg hover:shadow-lg transition">
              <MapPin className="w-12 h-12 text-amber-600 mb-4" />
              <h3 className="text-xl font-semibold text-amber-900 mb-2">
                تحديد المواقع
              </h3>
              <p className="text-gray-600">
                حدد مواقع التمركز بدقة على الخريطة مع إمكانية تعديل الإحداثيات
              </p>
            </div>
            <div className="p-6 border border-amber-200 rounded-lg hover:shadow-lg transition">
              <Users className="w-12 h-12 text-amber-600 mb-4" />
              <h3 className="text-xl font-semibold text-amber-900 mb-2">
                إدارة الأفراد
              </h3>
              <p className="text-gray-600">
                أضف وعدّل بيانات الأفراد المتمركزين مع أرقام التواصل
              </p>
            </div>
            <div className="p-6 border border-amber-200 rounded-lg hover:shadow-lg transition">
              <Activity className="w-12 h-12 text-amber-600 mb-4" />
              <h3 className="text-xl font-semibold text-amber-900 mb-2">
                تقارير فورية
              </h3>
              <p className="text-gray-600">
                احصل على معلومات فورية عن جميع المواقع والأفراد
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-amber-900 text-white py-8 mt-16">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <p>© 2025 خريطة الدرعية - جميع الحقوق محفوظة</p>
          <p className="text-amber-100 mt-2">نظام متطور لإدارة الأمن والتنظيم المروري</p>
        </div>
      </footer>
    </div>
  );
}
