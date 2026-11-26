declare namespace Deno {
  namespace env {
    function get(name: string): string | undefined;
  }

  function serve(handler: (request: Request) => Response | Promise<Response>): void;
}

declare module "npm:@supabase/supabase-js@2" {
  export function createClient(url: string, key: string, options?: unknown): any;
}

declare module "npm:web-push@3.6.7" {
  interface WebPushOptions {
    TTL?: number;
  }

  interface PushSubscription {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  }

  const webpush: {
    setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
    sendNotification(subscription: PushSubscription, payload: string, options?: WebPushOptions): Promise<unknown>;
  };

  export default webpush;
}
