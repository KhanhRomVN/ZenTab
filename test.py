def cong(a: int, b: int) -> int:
 """Hàm cộng hai số nguyên"""
 return a + b

def tru(a: int, b: int) -> int:
 """Hàm trừ hai số nguyên với xử lý edge cases"""
 if not isinstance(a, int) or not isinstance(b, int):
 raise TypeError("Cả hai tham số phải là số nguyên")
 
 # Kiểm tra tràn số (overflow)
 result = a - b
 if (result > 0 and a < 0 and b > 0) or (result < 0 and a > 0 and b < 0):
 # Trường hợp có thể gây tràn số
 if abs(a) > 10**18 or abs(b) > 10**18:
 raise OverflowError("Kết quả có thể vượt quá giới hạn số nguyên")
 
 return result
