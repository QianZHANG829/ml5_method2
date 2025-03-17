import os
import json

# 设置输入文件夹和输出文件夹路径
input_dir = "/Users/qianzhang/Desktop/ml5_method2/examples/movement_classifier-main/data/data_test8_acceleration"   # 存放原始 JSON 文件的文件夹
output_dir = "/Users/qianzhang/Desktop/ml5_method2/examples/movement_classifier-main/data/data_test9_acceleration"  # 存放拆分后 JSON 文件的文件夹


if not os.path.exists(output_dir):
    os.makedirs(output_dir)

# 每组帧数
group_size = 75

# 遍历输入文件夹下的所有 JSON 文件
for filename in os.listdir(input_dir):
    if filename.lower().endswith(".json"):
        filepath = os.path.join(input_dir, filename)
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        # 假设 JSON 结构为：{"data": [item1, item2, ...]}，
        # 每个 item 内含 "xs" 数组，其长度可能为150帧等
        new_items = []  # 用于存放拆分后的所有数据项
        for item in data.get("data", []):
            xs = item.get("xs", [])
            # 将 xs 按 group_size 拆分
            chunks = [xs[i:i+group_size] for i in range(0, len(xs), group_size)]
            # 对于每个拆分出的 chunk，复制原有数据项并替换 xs 数组
            for chunk in chunks:
                new_item = item.copy()  # 复制其他字段（例如 label）
                new_item["xs"] = chunk
                new_items.append(new_item)
        
        base_name = os.path.splitext(filename)[0]
        new_base_name = base_name.replace("150frame", "75frame").replace("test8", "test9")
        for i, new_item in enumerate(new_items):
            new_data = {"data": [new_item]}
            out_filename = f"{new_base_name}_chunk{i+1}.json"
            out_filepath = os.path.join(output_dir, out_filename)
            with open(out_filepath, "w", encoding="utf-8") as out_f:
                json.dump(new_data, out_f, indent=2, ensure_ascii=False)
            print(f"Saved {out_filepath}")

