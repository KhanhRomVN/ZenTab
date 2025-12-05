// src/background/utils/dom/text-utils.ts

/**
 * Text Utilities - Helper functions cho text manipulation
 */
export class TextUtils {
  /**
   * Truncate text với ellipsis
   */
  static truncate(
    text: string,
    maxLength: number,
    ellipsis: string = "..."
  ): string {
    if (!text || text.length <= maxLength) return text;

    return text.substring(0, maxLength) + ellipsis;
  }

  /**
   * Normalize text (remove extra spaces, normalize line breaks)
   */
  static normalize(text: string): string {
    if (!text) return "";

    // Thay thế multiple spaces với single space
    let normalized = text.replace(/\s+/g, " ");

    // Thay thế multiple line breaks với single line break
    normalized = normalized.replace(/\n+/g, "\n");

    // Trim
    normalized = normalized.trim();

    return normalized;
  }

  /**
   * Tính toán số từ
   */
  static wordCount(text: string): number {
    if (!text) return 0;

    // Split bằng whitespace và lọc empty strings
    const words = text
      .trim()
      .split(/\s+/)
      .filter((word) => word.length > 0);
    return words.length;
  }

  /**
   * Tính toán reading time (phút)
   */
  static readingTime(text: string, wordsPerMinute: number = 200): number {
    const wordCount = this.wordCount(text);
    return Math.ceil(wordCount / wordsPerMinute);
  }

  /**
   * Extract sentences từ text
   */
  static extractSentences(text: string): string[] {
    if (!text) return [];

    // Split bằng punctuation marks
    const sentences = text.split(/[.!?]+/).filter((sentence) => {
      return sentence.trim().length > 0;
    });

    return sentences.map((sentence) => sentence.trim() + ".");
  }

  /**
   * Extract paragraphs từ text
   */
  static extractParagraphs(text: string): string[] {
    if (!text) return [];

    // Split bằng multiple line breaks
    const paragraphs = text.split(/\n\s*\n/).filter((paragraph) => {
      return paragraph.trim().length > 0;
    });

    return paragraphs.map((paragraph) => paragraph.trim());
  }

  /**
   * Extract words từ text
   */
  static extractWords(text: string): string[] {
    if (!text) return [];

    // Split bằng non-word characters
    const words = text.split(/\W+/).filter((word) => {
      return word.length > 0 && /\w/.test(word);
    });

    return words;
  }

  /**
   * Tìm và highlight text
   */
  static highlight(
    text: string,
    searchTerm: string,
    highlightTag: string = "mark"
  ): string {
    if (!text || !searchTerm) return text;

    const regex = new RegExp(`(${this.escapeRegex(searchTerm)})`, "gi");
    return text.replace(regex, `<${highlightTag}>$1</${highlightTag}>`);
  }

  /**
   * Escape regex special characters
   */
  static escapeRegex(text: string): string {
    if (!text) return "";

    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Slugify text (tạo URL-friendly slug)
   */
  static slugify(text: string, separator: string = "-"): string {
    if (!text) return "";

    return text
      .toLowerCase()
      .normalize("NFD") // Tách ký tự có dấu
      .replace(/[\u0300-\u036f]/g, "") // Xóa dấu
      .replace(/[^a-z0-9]+/g, separator) // Thay thế non-alphanumeric với separator
      .replace(new RegExp(`^${separator}|${separator}$`, "g"), ""); // Xóa separator ở đầu/cuối
  }

  /**
   * Camel case to snake case
   */
  static camelToSnake(text: string): string {
    if (!text) return "";

    return text
      .replace(/([A-Z])/g, "_$1")
      .toLowerCase()
      .replace(/^_/, "");
  }

  /**
   * Snake case to camel case
   */
  static snakeToCamel(text: string): string {
    if (!text) return "";

    return text
      .toLowerCase()
      .replace(/(_\w)/g, (matches) => matches[1].toUpperCase());
  }

  /**
   * Title case text
   */
  static toTitleCase(text: string): string {
    if (!text) return "";

    return text
      .toLowerCase()
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  /**
   * Kiểm tra nếu text chứa HTML
   */
  static containsHTML(text: string): boolean {
    if (!text) return false;

    const htmlRegex = /<[a-z][\s\S]*>/i;
    return htmlRegex.test(text);
  }

  /**
   * Strip HTML tags từ text
   */
  static stripHTML(text: string): string {
    if (!text) return "";

    return text.replace(/<[^>]*>/g, "");
  }

  /**
   * Extract URLs từ text
   */
  static extractURLs(text: string): string[] {
    if (!text) return [];

    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const matches = text.match(urlRegex);

    return matches ? Array.from(matches) : [];
  }

  /**
   * Extract emails từ text
   */
  static extractEmails(text: string): string[] {
    if (!text) return [];

    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
    const matches = text.match(emailRegex);

    return matches ? Array.from(matches) : [];
  }

  /**
   * Extract hashtags từ text
   */
  static extractHashtags(text: string): string[] {
    if (!text) return [];

    const hashtagRegex = /#[\w\u0590-\u05ff]+/gi;
    const matches = text.match(hashtagRegex);

    return matches ? Array.from(matches) : [];
  }

  /**
   * Extract mentions từ text
   */
  static extractMentions(text: string): string[] {
    if (!text) return [];

    const mentionRegex = /@[\w\u0590-\u05ff]+/gi;
    const matches = text.match(mentionRegex);

    return matches ? Array.from(matches) : [];
  }

  /**
   * Tính toán similarity giữa 2 texts (Levenshtein distance)
   */
  static similarity(text1: string, text2: string): number {
    if (!text1 || !text2) return 0;

    const longer = text1.length > text2.length ? text1 : text2;
    const shorter = text1.length > text2.length ? text2 : text1;

    if (longer.length === 0) return 1.0;

    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  /**
   * Levenshtein distance algorithm
   */
  private static levenshteinDistance(a: string, b: string): number {
    const matrix = Array(b.length + 1)
      .fill(null)
      .map(() => Array(a.length + 1).fill(null));

    for (let i = 0; i <= a.length; i++) {
      matrix[0][i] = i;
    }

    for (let j = 0; j <= b.length; j++) {
      matrix[j][0] = j;
    }

    for (let j = 1; j <= b.length; j++) {
      for (let i = 1; i <= a.length; i++) {
        const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Tính toán entropy của text
   */
  static entropy(text: string): number {
    if (!text) return 0;

    const frequencies: Record<string, number> = {};
    const length = text.length;

    // Tính tần suất của mỗi ký tự
    for (const char of text) {
      frequencies[char] = (frequencies[char] || 0) + 1;
    }

    // Tính entropy
    let entropy = 0;
    for (const char in frequencies) {
      const frequency = frequencies[char] / length;
      entropy -= frequency * Math.log2(frequency);
    }

    return entropy;
  }

  /**
   * Kiểm tra nếu text có vẻ là spam
   */
  static isSpam(
    text: string,
    spamIndicators: string[] = ["FREE", "WIN", "URGENT", "CLICK HERE"]
  ): boolean {
    if (!text) return false;

    const upperText = text.toUpperCase();
    return spamIndicators.some((indicator) => upperText.includes(indicator));
  }

  /**
   * Sanitize text (remove harmful content)
   */
  static sanitize(text: string): string {
    if (!text) return "";

    // Remove script tags và content
    let sanitized = text.replace(
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      ""
    );

    // Remove dangerous patterns
    const dangerousPatterns = [
      /javascript:/gi,
      /data:/gi,
      /vbscript:/gi,
      /on\w+\s*=/gi,
    ];

    dangerousPatterns.forEach((pattern) => {
      sanitized = sanitized.replace(pattern, "");
    });

    return sanitized;
  }

  /**
   * Format số với thousands separator
   */
  static formatNumber(number: number, locale: string = "vi-VN"): string {
    return new Intl.NumberFormat(locale).format(number);
  }

  /**
   * Format date
   */
  static formatDate(date: Date, format: string = "dd/MM/yyyy"): string {
    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const seconds = date.getSeconds().toString().padStart(2, "0");

    return format
      .replace("dd", day)
      .replace("MM", month)
      .replace("yyyy", year.toString())
      .replace("hh", hours)
      .replace("mm", minutes)
      .replace("ss", seconds);
  }

  /**
   * Tạo excerpt từ text (first n characters với complete sentence)
   */
  static createExcerpt(text: string, maxLength: number = 200): string {
    if (!text) return "";

    if (text.length <= maxLength) return text;

    // Cắt đến maxLength
    let excerpt = text.substring(0, maxLength);

    // Tìm vị trí của dấu câu cuối cùng
    const lastPunctuation = Math.max(
      excerpt.lastIndexOf("."),
      excerpt.lastIndexOf("!"),
      excerpt.lastIndexOf("?"),
      excerpt.lastIndexOf(" ")
    );

    // Nếu tìm thấy dấu câu, cắt đến đó
    if (lastPunctuation > maxLength * 0.5) {
      excerpt = excerpt.substring(0, lastPunctuation + 1);
    }

    return excerpt + "...";
  }
}
