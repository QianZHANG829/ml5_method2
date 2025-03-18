import os
import json

# 指定要扫描的文件夹路径（请根据实际情况修改）
folder_path = "/Users/qianzhang/Desktop/ml5_method2/examples/movement_classifier-main/data/data_test9_acceleration"

# 获取文件夹内所有以 .json 结尾的文件名
files = [f for f in os.listdir(folder_path) if f.lower().endswith(".json")]

# 构造索引字典
index =files

# 指定 index.json 输出路径（可以放在同一文件夹或其他位置）
output_path = os.path.join(folder_path, "acceleration_index.json")

# 写入 JSON 文件
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(index, f, indent=2, ensure_ascii=False)

print(f"index.json 已生成，路径：{output_path}")
