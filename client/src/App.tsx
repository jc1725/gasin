import { Toaster } from "@/components/ui/sonner";
import { lazy, Suspense } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import GasynAppShell from "./components/GasynAppShell";
import Home from "./pages/Home";

const Favorites = lazy(() => import("./pages/Favorites"));
const GoldBox = lazy(() => import("./pages/GoldBox"));
const Guide = lazy(() => import("./pages/Guide"));
const Methodology = lazy(() => import("./pages/Methodology"));
const ProductDetail = lazy(() => import("./pages/ProductDetail"));
const SearchProducts = lazy(() => import("./pages/SearchProducts"));
const AdminPrices = lazy(() => import("./pages/AdminPrices"));
const AdminSearchHistory = lazy(() => import("./pages/AdminSearchHistory"));
const AdminProductRequests = lazy(() => import("./pages/AdminProductRequests"));
const AdminHotDeals = lazy(() => import("./pages/AdminHotDeals"));
const AdminMembers = lazy(() => import("./pages/AdminMembers"));
const HotDeals = lazy(() => import("./pages/HotDeals"));

const routeLoaders: Array<[RegExp, () => Promise<unknown>]> = [
  [/^\/favorites(?:\/|$)/, () => import("./pages/Favorites")],
  [/^\/goldbox(?:\/|$)/, () => import("./pages/GoldBox")],
  [/^\/guide(?:\/|$)/, () => import("./pages/Guide")],
  [/^\/methodology(?:\/|$)/, () => import("./pages/Methodology")],
  [/^\/product\/\d+/, () => import("./pages/ProductDetail")],
  [/^\/search(?:\/|$)/, () => import("./pages/SearchProducts")],
  [/^\/admin(?:\/|$)/, () => import("./pages/AdminPrices")],
  [/^\/hot-deals(?:\/|$)/, () => import("./pages/HotDeals")],
];

export async function preloadRouteForPath(pathname: string) {
  const loader = routeLoaders.find(([pattern]) => pattern.test(pathname))?.[1];
  if (loader) await loader();
}

function Router() {
  return (
    <GasynAppShell>
      <Suspense fallback={<div className="min-h-[40vh]" aria-label="페이지를 불러오는 중" />}>
      <Switch>
        <Route path={"/"} component={Home} />
        <Route path={"/guide"} component={Guide} />
        <Route path={"/methodology"} component={Methodology} />
        <Route path={"/goldbox"} component={GoldBox} />
        <Route path={"/hot-deals"} component={HotDeals} />
        <Route path={"/favorites"} component={Favorites} />
        <Route path={"/search"} component={SearchProducts} />
        <Route path={"/admin"} component={AdminPrices} />
        <Route path={"/admin/searches"} component={AdminSearchHistory} />
        <Route path={"/admin/product-requests"} component={AdminProductRequests} />
        <Route path={"/admin/hot-deals"} component={AdminHotDeals} />
        <Route path={"/admin/members"} component={AdminMembers} />
        <Route path={"/product/:id"} component={ProductDetail} />
        <Route path={"/404"} component={NotFound} />
        <Route component={NotFound} />
      </Switch>
      </Suspense>
    </GasynAppShell>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
