// src/background/utils/dom/html-utils.ts

/**
 * HTML Utilities - Helper functions cho HTML manipulation
 */
export class HtmlUtils {
  /**
   * Trích xuất text từ HTML
   */
  static extractText(html: string): string {
    if (!html) return "";

    // Tạo temporary element để parse HTML
    const div = document.createElement("div");
    div.innerHTML = html;

    // Loại bỏ script và style tags
    const scripts = div.querySelectorAll("script, style");
    scripts.forEach((script) => script.remove());

    // Lấy text content
    return div.textContent?.trim() || div.innerText?.trim() || "";
  }

  /**
   * Sanitize HTML để tránh XSS
   */
  static sanitize(html: string): string {
    if (!html) return "";

    // Tạo temporary element để parse HTML
    const div = document.createElement("div");
    div.innerHTML = html;

    // Loại bỏ các element nguy hiểm
    const dangerousTags = ["script", "iframe", "object", "embed", "link"];
    dangerousTags.forEach((tag) => {
      const elements = div.querySelectorAll(tag);
      elements.forEach((el) => el.remove());
    });

    // Loại bỏ các attribute nguy hiểm
    const allElements = div.querySelectorAll("*");
    allElements.forEach((el) => {
      const dangerousAttributes = [
        "onclick",
        "onload",
        "onerror",
        "onmouseover",
        "href",
        "src",
      ];
      dangerousAttributes.forEach((attr) => {
        el.removeAttribute(attr);
      });
    });

    return div.innerHTML;
  }

  /**
   * Trích xuất tất cả links từ HTML
   */
  static extractLinks(html: string): string[] {
    if (!html) return [];

    const div = document.createElement("div");
    div.innerHTML = html;

    const links: string[] = [];
    const anchorTags = div.querySelectorAll("a[href]");

    anchorTags.forEach((a) => {
      const href = a.getAttribute("href");
      if (href && !href.startsWith("javascript:")) {
        links.push(href);
      }
    });

    return links;
  }

  /**
   * Trích xuất tất cả images từ HTML
   */
  static extractImages(html: string): string[] {
    if (!html) return [];

    const div = document.createElement("div");
    div.innerHTML = html;

    const images: string[] = [];
    const imgTags = div.querySelectorAll("img[src]");

    imgTags.forEach((img) => {
      const src = img.getAttribute("src");
      if (src) {
        images.push(src);
      }
    });

    return images;
  }

  /**
   * Tạo element từ HTML string
   */
  static createElementFromHTML<T extends HTMLElement>(
    htmlString: string
  ): T | null {
    if (!htmlString) return null;

    const div = document.createElement("div");
    div.innerHTML = htmlString.trim();

    const element = div.firstElementChild;
    return (element as T) || null;
  }

  /**
   * Kiểm tra nếu string chứa HTML tags
   */
  static containsHTML(str: string): boolean {
    if (!str) return false;

    const htmlRegex = /<[a-z][\s\S]*>/i;
    return htmlRegex.test(str);
  }

  /**
   * Tính toán reading time từ HTML
   */
  static calculateReadingTime(
    html: string,
    wordsPerMinute: number = 200
  ): number {
    const text = this.extractText(html);
    const wordCount = text.split(/\s+/).length;
    return Math.ceil(wordCount / wordsPerMinute);
  }

  /**
   * Lấy meta description từ HTML
   */
  static getMetaDescription(html: string): string | null {
    if (!html) return null;

    const div = document.createElement("div");
    div.innerHTML = html;

    const metaDescription = div.querySelector('meta[name="description"]');
    return metaDescription?.getAttribute("content") || null;
  }

  /**
   * Lấy title từ HTML
   */
  static getTitle(html: string): string | null {
    if (!html) return null;

    const div = document.createElement("div");
    div.innerHTML = html;

    const titleElement = div.querySelector("title");
    return titleElement?.textContent || null;
  }

  /**
   * Normalize HTML (chuẩn hoá line breaks, spaces)
   */
  static normalizeHTML(html: string): string {
    if (!html) return "";

    // Thay thế multiple spaces với single space
    let normalized = html.replace(/\s+/g, " ");

    // Thay thế multiple line breaks với single line break
    normalized = normalized.replace(/\n+/g, "\n");

    // Trim
    normalized = normalized.trim();

    return normalized;
  }
}
