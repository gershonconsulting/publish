export const runtime = 'edge';
import { redirect } from "next/navigation";
import { PRODUCT_HOME } from "@/lib/product";

/** Internal app: no marketing page. The middleware already sent strangers to /login. */
export default function RootPage() {
  redirect(PRODUCT_HOME);
}
