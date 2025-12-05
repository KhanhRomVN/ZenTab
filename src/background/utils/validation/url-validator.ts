// src/background/utils/validation/url-validator.ts

/**
 * URL Validator - Helper functions cho URL validation và manipulation
 */
export class UrlValidator {
  /**
   * Default URL validation options
   */
  static readonly DEFAULT_OPTIONS = {
    requireProtocol: true,
    allowedProtocols: ["http:", "https:", "ftp:", "file:", "ws:", "wss:"],
    requireHostname: true,
    allowLocalhost: true,
    allowIP: true,
    allowCredentials: false,
    maxLength: 2048,
  };

  /**
   * Validate URL string
   */
  static validate(
    urlString: string,
    options: Partial<typeof UrlValidator.DEFAULT_OPTIONS> = {}
  ): { valid: boolean; error?: string; url?: URL } {
    const config = { ...UrlValidator.DEFAULT_OPTIONS, ...options };

    // Kiểm tra độ dài
    if (urlString.length > config.maxLength) {
      return {
        valid: false,
        error: `URL quá dài (${urlString.length} > ${config.maxLength} ký tự)`,
      };
    }

    // Kiểm tra empty
    if (!urlString || urlString.trim().length === 0) {
      return { valid: false, error: "URL không được để trống" };
    }

    try {
      // Parse URL
      const url = new URL(urlString);

      // Kiểm tra protocol
      if (config.requireProtocol && !url.protocol) {
        return { valid: false, error: "URL phải có protocol" };
      }

      if (
        config.allowedProtocols.length > 0 &&
        !config.allowedProtocols.includes(url.protocol)
      ) {
        return {
          valid: false,
          error: `Protocol không được cho phép: ${
            url.protocol
          }. Chỉ chấp nhận: ${config.allowedProtocols.join(", ")}`,
        };
      }

      // Kiểm tra hostname
      if (config.requireHostname && !url.hostname) {
        return { valid: false, error: "URL phải có hostname" };
      }

      // Kiểm tra localhost
      if (!config.allowLocalhost && url.hostname === "localhost") {
        return { valid: false, error: "Localhost không được cho phép" };
      }

      // Kiểm tra IP addresses
      if (!config.allowIP && this.isIPAddress(url.hostname)) {
        return { valid: false, error: "Địa chỉ IP không được cho phép" };
      }

      // Kiểm tra credentials
      if (!config.allowCredentials && (url.username || url.password)) {
        return {
          valid: false,
          error: "Credentials không được cho phép trong URL",
        };
      }

      // Kiểm tra các ký tự nguy hiểm
      if (this.containsDangerousCharacters(urlString)) {
        return { valid: false, error: "URL chứa ký tự nguy hiểm" };
      }

      return { valid: true, url };
    } catch (error) {
      // Nếu không parse được, có thể là relative URL hoặc invalid URL
      if (config.requireProtocol) {
        return { valid: false, error: "URL không hợp lệ" };
      }

      // Thử thêm protocol mặc định
      try {
        const urlWithProtocol = urlString.startsWith("//")
          ? new URL(`https:${urlString}`)
          : new URL(`https://${urlString}`);

        return this.validate(urlWithProtocol.toString(), options);
      } catch {
        return { valid: false, error: "URL không hợp lệ" };
      }
    }
  }

  /**
   * Kiểm tra nếu URL là absolute
   */
  static isAbsolute(urlString: string): boolean {
    try {
      const url = new URL(urlString);
      return !!url.protocol && !!url.hostname;
    } catch {
      return false;
    }
  }

  /**
   * Kiểm tra nếu URL là relative
   */
  static isRelative(urlString: string): boolean {
    return !this.isAbsolute(urlString);
  }

  /**
   * Kiểm tra nếu URL là internal (same origin)
   */
  static isInternal(urlString: string, currentOrigin: string): boolean {
    try {
      const url = new URL(urlString, currentOrigin);
      const currentUrl = new URL(currentOrigin);
      return url.origin === currentUrl.origin;
    } catch {
      return false;
    }
  }

  /**
   * Kiểm tra nếu URL là external
   */
  static isExternal(urlString: string, currentOrigin: string): boolean {
    return !this.isInternal(urlString, currentOrigin);
  }

  /**
   * Kiểm tra nếu URL là secure (HTTPS)
   */
  static isSecure(urlString: string): boolean {
    try {
      const url = new URL(urlString);
      return url.protocol === "https:";
    } catch {
      return false;
    }
  }

  /**
   * Normalize URL (chuẩn hoá)
   */
  static normalize(
    urlString: string,
    options: {
      defaultProtocol?: string;
      removeTrailingSlash?: boolean;
      removeFragment?: boolean;
      removeQueryParams?: boolean | string[];
      sortQueryParams?: boolean;
    } = {}
  ): string {
    const config = {
      defaultProtocol: "https:",
      removeTrailingSlash: true,
      removeFragment: false,
      removeQueryParams: false,
      sortQueryParams: false,
      ...options,
    };

    try {
      let url: URL;

      try {
        url = new URL(urlString);
      } catch {
        // Thử thêm protocol nếu cần
        if (urlString.startsWith("//")) {
          url = new URL(`${config.defaultProtocol}${urlString}`);
        } else if (!urlString.includes("://")) {
          url = new URL(`${config.defaultProtocol}//${urlString}`);
        } else {
          throw new Error("Invalid URL");
        }
      }

      // Remove fragment
      if (config.removeFragment) {
        url.hash = "";
      }

      // Remove query parameters
      if (config.removeQueryParams) {
        if (Array.isArray(config.removeQueryParams)) {
          const paramsToRemove = config.removeQueryParams;
          url.searchParams.forEach((_, key) => {
            if (paramsToRemove.includes(key)) {
              url.searchParams.delete(key);
            }
          });
        } else {
          url.search = "";
        }
      }

      // Sort query parameters
      if (config.sortQueryParams && url.searchParams.toString()) {
        const sortedParams = new URLSearchParams();
        const paramsArray = Array.from(url.searchParams.entries());
        paramsArray.sort((a, b) => a[0].localeCompare(b[0]));
        paramsArray.forEach(([key, value]) => {
          sortedParams.append(key, value);
        });
        url.search = sortedParams.toString();
      }

      // Remove trailing slash
      let normalized = url.toString();
      if (config.removeTrailingSlash) {
        normalized = normalized.replace(/\/(?=\?|#|$)/, "");
      }

      return normalized;
    } catch (error) {
      return urlString;
    }
  }

  /**
   * Extract domain từ URL
   */
  static extractDomain(urlString: string): string | null {
    try {
      const url = new URL(urlString);
      return url.hostname;
    } catch {
      return null;
    }
  }

  /**
   * Extract protocol từ URL
   */
  static extractProtocol(urlString: string): string | null {
    try {
      const url = new URL(urlString);
      return url.protocol.replace(":", "");
    } catch {
      return null;
    }
  }

  /**
   * Extract path từ URL
   */
  static extractPath(urlString: string): string | null {
    try {
      const url = new URL(urlString);
      return url.pathname;
    } catch {
      return null;
    }
  }

  /**
   * Extract query parameters từ URL
   */
  static extractQueryParams(
    urlString: string
  ): Record<string, string | string[]> {
    try {
      const url = new URL(urlString);
      const params: Record<string, string | string[]> = {};

      url.searchParams.forEach((value, key) => {
        if (key in params) {
          const existing = params[key];
          if (Array.isArray(existing)) {
            existing.push(value);
          } else {
            params[key] = [existing, value];
          }
        } else {
          params[key] = value;
        }
      });

      return params;
    } catch {
      return {};
    }
  }

  /**
   * Kiểm tra nếu domain là IP address
   */
  static isIPAddress(hostname: string): boolean {
    // IPv4
    const ipv4Regex =
      /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

    // IPv6
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    const ipv6CompressedRegex =
      /^(([0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4})?::(([0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4})?$/;

    return (
      ipv4Regex.test(hostname) ||
      ipv6Regex.test(hostname) ||
      ipv6CompressedRegex.test(hostname)
    );
  }

  /**
   * Kiểm tra nếu URL có chứa ký tự nguy hiểm
   */
  private static containsDangerousCharacters(urlString: string): boolean {
    const dangerousPatterns = [
      /javascript:/i,
      /data:/i,
      /vbscript:/i,
      /file:/i,
      /\x00/, // Null byte
      /[\x00-\x1F\x7F]/, // Control characters
    ];

    return dangerousPatterns.some((pattern) => pattern.test(urlString));
  }

  /**
   * Sanitize URL (loại bỏ các phần nguy hiểm)
   */
  static sanitize(urlString: string): string {
    try {
      const url = new URL(urlString);

      // Remove credentials
      url.username = "";
      url.password = "";

      // Remove dangerous protocols
      const dangerousProtocols = ["javascript:", "data:", "vbscript:", "file:"];
      if (dangerousProtocols.includes(url.protocol)) {
        url.protocol = "https:";
      }

      // Remove dangerous characters từ path và query
      url.pathname = url.pathname.replace(/[\x00-\x1F\x7F]/g, "");
      url.search = url.search.replace(/[\x00-\x1F\x7F]/g, "");

      return url.toString();
    } catch {
      // Nếu không parse được, trả về string đã được làm sạch
      let sanitized = urlString;

      // Remove dangerous patterns
      sanitized = sanitized.replace(/javascript:/gi, "");
      sanitized = sanitized.replace(/data:/gi, "");
      sanitized = sanitized.replace(/vbscript:/gi, "");
      sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, "");

      return sanitized;
    }
  }

  /**
   * Resolve relative URL thành absolute URL
   */
  static resolve(relativeUrl: string, baseUrl: string): string | null {
    try {
      const base = new URL(baseUrl);
      const resolved = new URL(relativeUrl, base);
      return resolved.toString();
    } catch {
      return null;
    }
  }

  /**
   * Kiểm tra nếu URL match với pattern
   */
  static matchesPattern(
    urlString: string,
    pattern: string | RegExp | ((url: string) => boolean)
  ): boolean {
    if (typeof pattern === "string") {
      // Simple string matching
      return urlString.includes(pattern);
    } else if (pattern instanceof RegExp) {
      // Regex matching
      return pattern.test(urlString);
    } else if (typeof pattern === "function") {
      // Function matching
      return pattern(urlString);
    }

    return false;
  }

  /**
   * Tạo URL pattern cho matching
   */
  static createUrlPattern(
    domain: string,
    options: {
      includeSubdomains?: boolean;
      includePaths?: boolean;
      includeQuery?: boolean;
    } = {}
  ): RegExp {
    const config = {
      includeSubdomains: true,
      includePaths: true,
      includeQuery: true,
      ...options,
    };

    let pattern = "";

    // Protocol
    pattern += "https?://";

    // Subdomains
    if (config.includeSubdomains) {
      pattern += "([a-zA-Z0-9-]+\\.)*";
    }

    // Domain
    pattern += domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // TLD
    pattern += "(?:\\.[a-zA-Z]{2,})+";

    // Port
    pattern += "(?::\\d+)?";

    // Path
    if (config.includePaths) {
      pattern += "(?:/[^?#]*)?";
    }

    // Query
    if (config.includeQuery) {
      pattern += "(?:\\?[^#]*)?";
    }

    // Fragment
    pattern += "(?:#.*)?";

    return new RegExp(`^${pattern}$`, "i");
  }

  /**
   * Validate multiple URLs
   */
  static validateBatch(
    urls: string[],
    options: Partial<typeof UrlValidator.DEFAULT_OPTIONS> = {}
  ): Array<{ url: string; valid: boolean; error?: string }> {
    return urls.map((url) => {
      const result = this.validate(url, options);
      return {
        url,
        valid: result.valid,
        error: result.error,
      };
    });
  }

  /**
   * Filter valid URLs
   */
  static filterValid(
    urls: string[],
    options: Partial<typeof UrlValidator.DEFAULT_OPTIONS> = {}
  ): string[] {
    return urls.filter((url) => this.validate(url, options).valid);
  }

  /**
   * Filter invalid URLs
   */
  static filterInvalid(
    urls: string[],
    options: Partial<typeof UrlValidator.DEFAULT_OPTIONS> = {}
  ): Array<{ url: string; error: string }> {
    return urls
      .map((url) => {
        const result = this.validate(url, options);
        return { url, error: result.error || "Invalid URL" };
      })
      .filter((item) => item.error);
  }

  /**
   * Kiểm tra nếu URL có thể là phishing
   */
  static isPotentialPhishing(
    urlString: string,
    trustedDomains: string[] = []
  ): boolean {
    try {
      const url = new URL(urlString);

      // Kiểm tra các dấu hiệu phishing phổ biến
      const phishingIndicators = [
        // IP address thay vì domain
        this.isIPAddress(url.hostname),

        // Sử dụng ký tự lookalike
        /[а-яА-Я]/.test(url.hostname), // Cyrillic characters
        /[٠-٩]/.test(url.hostname), // Arabic numerals

        // Subdomain quá dài
        url.hostname.split(".").length > 4,

        // Sử dụng HTTPS nhưng có vấn đề với certificate (không thể kiểm tra ở đây)

        // URL quá dài
        urlString.length > 100,

        // Chứa từ khóa phishing phổ biến
        /(login|signin|account|secure|update|verify|bank|paypal|amazon|apple)\.(?!com|net|org)/i.test(
          url.hostname
        ),
      ];

      // Nếu là trusted domain, không coi là phishing
      if (trustedDomains.some((domain) => url.hostname.endsWith(domain))) {
        return false;
      }

      return phishingIndicators.some((indicator) => indicator === true);
    } catch {
      return false;
    }
  }
}
