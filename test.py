def cong(a: int, b: int) -> int:
 """Hàm cộng hai số nguyên"""
 return a + b

def tru(a: int, b: int) -> int:
 """Hàm trừ hai số nguyên"""
 return a - b

# Test các hàm
if __name__ == "__main__":
 # Test hàm cộng
 print("Test hàm cộng:")
 print(f"5 + 3 = {cong(5, 3)}") # Kết quả mong đợi: 8
 print(f"10 + (-2) = {cong(10, -2)}") # Kết quả mong đợi: 8
 
 # Test hàm trừ
 print("Test hàm trừ:")
 print(f"10 - 4 = {tru(10, 4)}") # Kết quả mong đợi: 6
 print(f"5 - 8 = {tru(5, 8)}") # Kết quả mong đợi: -3
 print(f"0 - 5 = {tru(0, 5)}") # Kết quả mong đợi: -5
