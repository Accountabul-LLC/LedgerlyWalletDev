/**
 * Minimal ambient typing for the slice of the extension API this wallet uses.
 * Kept local so the project does not need the full @types/chrome package.
 */
declare namespace chrome {
  namespace runtime {
    const id: string;
    function getURL(path: string): string;
    function sendMessage(message: unknown, callback?: (response: unknown) => void): void;
    const lastError: { message?: string } | undefined;

    interface MessageSender {
      id?: string;
      url?: string;
      origin?: string;
      tab?: { id?: number };
      frameId?: number;
    }

    const onMessage: {
      addListener(
        listener: (
          message: unknown,
          sender: MessageSender,
          sendResponse: (response?: unknown) => void,
        ) => boolean | void,
      ): void;
    };
  }

  namespace storage {
    interface Area {
      get(keys: string | string[] | null): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
      clear(): Promise<void>;
    }
    const local: Area;
    const session: Area;
  }

  namespace windows {
    function create(options: {
      url: string;
      type?: string;
      width?: number;
      height?: number;
      focused?: boolean;
    }): Promise<{ id?: number }>;
  }

  namespace action {
    function openPopup(): Promise<void>;
  }

  namespace tabs {
    function sendMessage(tabId: number, message: unknown): Promise<unknown>;
  }
}
