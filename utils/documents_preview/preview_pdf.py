def preview_pdf(file_path):
    relative_url = f"/{file_path}"
            
    return {
        'status': 'success',
        'file_path': file_path,
        'type': 'pdf',
        'url': relative_url
    }