import pandas as pd

def preview_csv(file_path):
    """预览CSV文件"""
    try:
        # 读取CSV文件，限制行数
        # df = pd.read_csv(file_path, nrows=100)
        df = pd.read_csv(file_path)
        
        # print(df)
        # 转换为HTML表格
        html_table = df.to_html(
            classes='table table-striped table-bordered', 
            index=False, 
            # max_cols=10  # 限制列数
        )
        
        return {
            'type': 'html_table',
            'content': html_table
        }
    except Exception as e:
        return {
            'type': 'text',
            'content': f"预览CSV失败：{str(e)}"
        }
