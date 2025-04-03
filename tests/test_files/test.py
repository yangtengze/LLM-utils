import os
import cv2
from paddleocr import PPStructure,draw_structure_result,save_structure_res
# table_engine = PPStructure(show_log=True, image_orientation=True)
os.environ['CUDA_VISIBLE_DEVICES'] = '0'
table_engine = PPStructure(show_log=False)

save_folder = 'output'
img_path = 'tests/test_files/ppstructure/1.png'
img = cv2.imread(img_path)
result = table_engine(img)
save_structure_res(result, save_folder,os.path.basename(img_path).split('.')[0])

for line in result:
    line.pop('img')
    if line['type'] != 'table':
        text = ''
        for content in line['res']:
            text += content["text"]
        print(f'{line["type"]}: {text} : {line["score"]}')
    else:
        print(f'{line["type"]}: {line["res"]["html"]} : {line["score"]}')

        
# from PIL import Image

# font_path = 'doc/fonts/simfang.ttf' # PaddleOCR下提供字体包
# image = Image.open(img_path).convert('RGB')
# im_show = draw_structure_result(image, result,font_path=font_path)
# im_show = Image.fromarray(im_show)
# im_show.save(f'{save_folder}/result.jpg')
