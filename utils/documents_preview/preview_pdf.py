import PyPDF2


def preview_pdf(file_path):
    """预览PDF文件"""
    try:
        with open(file_path, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            
            # 提取前5页内容并转换为HTML
            html_content = "<div class='pdf-preview'>"
            
            # 限制预览页数为5页或总页数
            max_pages = min(5, len(pdf_reader.pages))
            
            for page_num in range(max_pages):
                page = pdf_reader.pages[page_num]
                text = page.extract_text()
                
                html_content += f"""
                <div class='pdf-page'>
                    <h4>第 {page_num + 1} 页</h4>
                    <pre>{text}</pre>
                </div>
                """
            
            html_content += f"""
                <div class='pdf-info'>
                    总页数：{len(pdf_reader.pages)}
                </div>
            </div>
            """
        
        return {
            'type': 'html',
            'content': html_content
        }
    except Exception as e:
        return {
            'type': 'text',
            'content': f"预览PDF失败：{str(e)}"
        }
