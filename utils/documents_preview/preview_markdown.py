import markdown2

def preview_markdown(file_path):
    """预览Markdown文件"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            markdown_text = f.read()
        
        # 转换为HTML，添加更多扩展
        html_content = markdown2.markdown(
            markdown_text, 
            extras=[
                # 基础格式
                'tables',           # 表格支持
                'fenced-code-blocks', # 代码块支持
                'code-friendly',     # 代码友好
                'cuddled-lists',     # 紧密列表
                'header-ids',        # 标题ID
                
                # 高级格式
                'footnotes',         # 脚注
                'strike',            # 删除线
                'task-lists',        # 任务列表
                'metadata',          # 元数据支持
                'wiki-tables',       # Wiki风格表格
                
                # 排版增强
                'break-on-newline',  # 换行支持
                'smarty-pants',      # 智能标点
                
                # 其他增强
                'spoiler',           # 剧透文本
                'cuddled-lists',     # 紧密列表
                'header-ids',        # 标题ID
            ]
        )
        
        return {
            'type': 'html',
            'content': html_content
        }
    except Exception as e:
        return {
            'type': 'text',
            'content': f"预览Markdown失败：{str(e)}"
        }
