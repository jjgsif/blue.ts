import { Memoirist } from "memoirist";
import type { HttpMethod, RouteImplementation } from './types.ts';
import {RouterError} from "./errors";

interface RouteResult extends RouteImplementation {
  params?: Record<string, any>;
}

interface NamedRoute {
  method: HttpMethod;
  path: string;
}

export class Router {
  private readonly memoirist = new Memoirist({lazy: true});
  private readonly names = new Map<string, NamedRoute>();

  route(method: HttpMethod, path: string, implementation: RouteImplementation) {
    if (this.memoirist.find(method, path)) {
      throw new RouterError("Route Collision", method, path);
    }
    this.memoirist.add(method, path, implementation);
    if (implementation.name) {
      this.names.set(implementation.name, { method, path });
    }
  }

  match(method: HttpMethod, url: string): RouteResult | null
  {
    const path = url.startsWith('/') ? url : new URL(url).pathname;
    const result = this.memoirist.find(method, path);

    if (!result) {
      return null;
    }

    return {
      params: result?.params,
      ...result.store as RouteImplementation
    }
  }

  /**
   * Look up a named route. Returns its method and path pattern.
   * Throws if the name is not registered.
   */
  lookup(name: string): NamedRoute {
    const route = this.names.get(name);
    if (!route) throw new Error(`No route named "${name}"`);
    return route;
  }

  /**
   * Generate a URL for a named route.
   *
   * Path params are substituted from `params`; any keys not present in the
   * path pattern are appended as query string values.
   *
   * @example
   * router.generate('user.show', { id: '42' })           // → '/users/42'
   * router.generate('user.show', { id: '42', tab: 'posts' }) // → '/users/42?tab=posts'
   */
  generate(name: string, params: Record<string, string> = {}): string {
    const { path } = this.lookup(name);
    const remaining = { ...params };

    const interpolated = path.replace(/:([^/]+)/g, (_, key) => {
      if (!(key in remaining)) throw new Error(`Missing param "${key}" for route "${name}"`);
      const value = remaining[key] as string;
      delete remaining[key];
      return encodeURIComponent(value);
    });

    const qs = new URLSearchParams(remaining).toString();
    return qs ? `${interpolated}?${qs}` : interpolated;
  }
}