import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export function useFavorites() {
  const { user, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const isGoogleUser = isAuthenticated && user?.loginMethod === "google";
  const favorites = trpc.favorites.list.useQuery(undefined, { enabled: isGoogleUser });
  const toggle = trpc.favorites.toggle.useMutation({
    onSuccess: saved => {
      toast.success(saved ? "찜한상품에 추가했어요." : "찜한상품에서 제거했어요.");
      utils.favorites.list.invalidate();
      utils.favorites.listTargetPrices.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const toggleProduct = (productId: number) => {
    if (!isGoogleUser) {
      window.location.assign("/api/auth/google");
      return;
    }
    toggle.mutate({ productId });
  };

  return {
    user,
    isAuthenticated,
    isGoogleUser,
    favoriteIds: new Set((favorites.data ?? []).map(product => product.id)),
    favoriteProducts: favorites.data ?? [],
    favoritesLoading: favorites.isLoading,
    toggleProduct,
    isToggling: toggle.isPending,
  };
}
