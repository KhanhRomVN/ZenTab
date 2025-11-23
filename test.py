def cong(a: int, b: int) -> int:
 """Hàm cộng hai số nguyên"""
 return a + b

def tru(a: int, b: int) -> int:
 """Hàm trừ hai số nguyên"""
 return a - b

# Ví dụ sử dụng các hàm
if __name__ == "__main__":
 # Test hàm cộng
 ket_qua_cong = cong(10, 5)
 print(f"10 + 5 = {ket_qua_cong}")
 
 # Test hàm trừ
 ket_qua_tru = tru(10, 5)
 print(f"10 - 5 = {ket_qua_tru}")
 
 # Test với số âm
 ket_qua_tru_am = tru(5, 10)
 print(f"5 - 10 = {ket_qua_tru_am}")
