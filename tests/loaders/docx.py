from docx import Document

import os

doc = Document('../../data/documents/3.docx')
output_dir = './output'
if not os.path.exists(output_dir):
    os.makedirs(output_dir)

# 提取图片
for i, rel in enumerate(doc.part.rels.values()):
    if "image" in rel.target_ref:
        # 获取图片数据
        img_data = rel.target_part.blob
        # 保存图片
        with open(os.path.join(output_dir, f'image_{i+1}.png'), 'wb') as img_file:
            img_file.write(img_data)