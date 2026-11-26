import { isFiniteNumber } from './event';
import { cleanText } from './text';
import type {
  EcommerceCategory,
  EcommerceItem,
  EcommerceOrder,
  EcommerceProduct,
  MatomoCommand,
} from './types';

const MAX_CATEGORIES = 5;

/*
 * Matomo reads an absent value differently per command, so each builder below uses the
 * "absent" value that matomo.js actually skips: `''` for order amounts and names, and the
 * defaults matomo.js itself applies to cart items (price 0, quantity 1).
 */

export interface ProductView {
  sku: string;
  name: string;
  category: EcommerceCategory;
  price: number | '';
}

export function normalizeProduct(product: EcommerceProduct): ProductView | null {
  const sku = cleanText(product?.sku);
  if (!sku) return null;

  return {
    sku,
    name: cleanText(product.name),
    category: normalizeCategory(product.category),
    price: isFiniteNumber(product.price) ? product.price : '',
  };
}

/**
 * The product view as the tracking request parameters matomo.js's `setEcommerceView` would add, URL-encoded.
 * The tracker sends them with one page view only, instead of calling `setEcommerceView`: matomo.js keeps
 * that for the rest of the page load and adds it to every later request, and the only way to reset it
 * leaves an empty `_pkc`, which Matomo still records as a product view of category "Value not defined".
 *
 * An absent name or category is left out rather than sent empty: Matomo stores an empty one as
 * "Value not defined". Matomo reads an array category as several only from a JSON array string;
 * anything else is one category. (Cart items are different: they are serialized as a whole, so a
 * nested array survives.) The values are well formed (`cleanText`), so encoding them cannot throw.
 */
export function productViewParameters(view: ProductView): string {
  const category = Array.isArray(view.category) ? JSON.stringify(view.category) : view.category;
  const parameters: Array<[string, string | number]> = [['_pks', view.sku]];
  if (view.name) parameters.push(['_pkn', view.name]);
  if (category) parameters.push(['_pkc', category]);
  if (view.price !== '') parameters.push(['_pkp', view.price]);
  return parameters.map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join('&');
}

export function clearCartCommand(): MatomoCommand {
  return ['clearEcommerceCart'];
}

/** One `addEcommerceItem` per valid item; items without a sku are skipped. */
export function itemCommands(items: EcommerceItem[] | undefined): MatomoCommand[] {
  const commands: MatomoCommand[] = [];
  for (const item of Array.isArray(items) ? items : []) {
    const product = normalizeProduct(item);
    if (product === null) continue;
    const price = typeof product.price === 'number' ? product.price : 0;
    const quantity = isFiniteNumber(item.quantity) ? item.quantity : 1;
    commands.push(['addEcommerceItem', product.sku, product.name, product.category, price, quantity]);
  }
  return commands;
}

export function cartUpdateCommand(grandTotal: number): MatomoCommand {
  return ['trackEcommerceCartUpdate', grandTotal];
}

export function orderCommand(order: EcommerceOrder, orderId: string): MatomoCommand {
  return [
    'trackEcommerceOrder',
    orderId,
    order.grandTotal,
    amountOrBlank(order.subTotal),
    amountOrBlank(order.tax),
    amountOrBlank(order.shipping),
    amountOrBlank(order.discount),
  ];
}

function amountOrBlank(amount: number | undefined): number | '' {
  return isFiniteNumber(amount) ? amount : '';
}

function normalizeCategory(category: EcommerceCategory | undefined): EcommerceCategory {
  if (Array.isArray(category)) {
    const categories = category.map(cleanText).filter(Boolean).slice(0, MAX_CATEGORIES);
    return categories.length > 0 ? categories : '';
  }
  return cleanText(category);
}
