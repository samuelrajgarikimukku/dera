import json
import sys
import os
import pandas as pd
import numpy as np
import traceback

# Add current directory to python import path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from validators import validate_columns
from chart_generator import generate_chart

def load_dataset(path):
    path_lower = path.lower()
    if path_lower.endswith(('.xlsx', '.xls')):
        return pd.read_excel(path)
    elif path_lower.endswith('.parquet'):
        return pd.read_parquet(path)
    else:
        return pd.read_csv(path)

if __name__ == '__main__':
    try:
        # Read parameters from stdin JSON to prevent command line argument issues
        input_data = json.loads(sys.stdin.read())
        
        path = input_data['path']
        chart_type = input_data['chart_type']
        x_col = input_data['x_col']
        y_col = input_data['y_col']
        zoom_level = float(input_data['zoom_level'])
        output_img_path = input_data['output_img_path']
        output_meta_path = input_data['output_meta_path']
        relative_img_path = input_data['relative_img_path']
        project_name = input_data['project_name']
        preprocessing_steps = input_data.get('preprocessing_steps', [])
        
        # New advanced options & mode
        visualization_mode = input_data.get('visualization_mode', 'standard')
        custom_code = input_data.get('custom_code', '')
        advanced_options = input_data.get('advanced_options', {})

        # Load dataset and apply pipeline steps using Polars Lazy Execution
        sys.path.append(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'dataset'))
        import polars_transforms
        import polars as pl

        x_cols = [c.strip() for c in x_col.split(',') if c.strip()]
        y_cols = [c.strip() for c in y_col.split(',') if c.strip()]

        # Load dataframes
        raw_df = load_dataset(path)
        
        # Load processed dataframe (applying pipeline)
        lf = polars_transforms.load_dataset(path)
        lf = polars_transforms.apply_pipeline(lf, preprocessing_steps)
        
        if visualization_mode == 'standard':
            # Projection pushdown for standard visualization to keep it fast
            needed_cols = list(set(x_cols + y_cols))
            needed_cols = [c for c in needed_cols if c in lf.columns]
            if needed_cols:
                lf = lf.select(needed_cols)
        
        df = lf.collect().to_pandas()

        if visualization_mode == 'custom':
            # Custom code execution mode
            # Expose helper variables
            dataset_name = os.path.basename(path)
            chart_title = advanced_options.get('chartTitle', f"Custom Plot - {dataset_name}")
            
            # Setup python plotting environment
            import matplotlib
            matplotlib.use('Agg')
            import matplotlib.pyplot as plt
            import seaborn as sns
            
            # Clear any leftover figures
            plt.close('all')

            # Sandbox execution globals
            # Overwrite standard builtins for safety
            safe_builtins = dict(sys.modules['builtins'].__dict__)
            
            class RestrictedImportError(Exception):
                pass

            def safe_import(name, globals=None, locals=None, fromlist=(), level=0):
                # Block dangerous modules
                blocked = ['os', 'sys', 'subprocess', 'pathlib', 'socket', 'shutil', 'urllib', 'multiprocessing', 'pty', 'platform']
                for b in blocked:
                    if name == b or name.startswith(b + '.'):
                        raise RestrictedImportError(f"Import of module '{name}' is restricted for safety.")
                return __import__(name, globals, locals, fromlist, level)

            safe_builtins['__import__'] = safe_import
            # Remove high-risk builtins
            for dangerous in ['open', 'eval', 'exec', 'compile', 'input']:
                if dangerous in safe_builtins:
                    del safe_builtins[dangerous]

            # Restricted execution environment dictionary
            sandbox_globals = {
                "__builtins__": safe_builtins,
                "df": df.copy(), # pass read-only copy
                "raw_df": raw_df.copy(),
                "xAxis": list(x_cols),
                "yAxis": list(y_cols),
                "chartTitle": chart_title,
                "datasetName": dataset_name,
                "projectName": project_name,
                "selectedChartType": chart_type,
                "plt": plt,
                "sns": sns,
                "pd": pd,
                "np": np
            }

            try:
                # Execute custom script
                exec(custom_code, sandbox_globals)
                
                # Check if figure was created; if not, create one to save
                if not plt.get_fignums():
                    raise ValueError("No matplotlib figure was created in your custom code. Please make sure to plot something.")
                
                # Save plot to output path
                # Map zoom level to DPI
                if zoom_level <= 1.0:
                    dpi_val = 150
                elif zoom_level <= 1.25:
                    dpi_val = 200
                elif zoom_level <= 1.5:
                    dpi_val = 250
                else:
                    dpi_val = 300
                
                plt.savefig(output_img_path, dpi=dpi_val, bbox_inches='tight')
                plt.close('all')
                
                fig_config = {
                    "dpi": dpi_val,
                    "figsize": [8, 4.5],
                    "style": "custom"
                }

            except Exception as e:
                # Parse traceback to extract exact line number and code snippet
                exc_type, exc_value, exc_tb = sys.exc_info()
                tb_list = traceback.extract_tb(exc_tb)
                
                error_line = None
                error_snippet = ""
                
                # Search frames for custom code
                for frame in tb_list:
                    if frame.filename == '<string>':
                        error_line = frame.lineno
                        error_snippet = frame.line
                        break
                
                if exc_type is SyntaxError:
                    error_line = exc_value.lineno
                    error_snippet = exc_value.text.strip() if exc_value.text else ""
                    offset = exc_value.offset
                    if offset is not None and error_snippet:
                        caret_line = " " * (offset - 1) + "^"
                        error_snippet = f"{error_snippet}\n{caret_line}"
                
                err_msg = f"{exc_type.__name__}: {str(exc_value)}"
                
                if error_line and not error_snippet:
                    code_lines = custom_code.split('\n')
                    if 1 <= error_line <= len(code_lines):
                        error_snippet = code_lines[error_line - 1].strip()

                metadata = {
                    "success": False,
                    "errorType": "ExecutionError",
                    "error": err_msg,
                    "line": error_line,
                    "snippet": error_snippet
                }
                print(json.dumps(metadata))
                sys.exit(0)
        else:
            # Standard visualization mode
            validate_columns(df, x_cols, y_cols, chart_type)
            fig_config = generate_chart(df, x_cols, y_cols, chart_type, zoom_level, output_img_path, advanced_options)

        # Save metadata
        metadata = {
            "success": True,
            "imagePath": relative_img_path,
            "chartType": chart_type,
            "xAxis": x_cols,
            "yAxis": y_cols,
            "projectName": project_name,
            "datasetPath": path,
            "zoom": zoom_level,
            "figureConfig": fig_config,
            "visualizationMode": visualization_mode,
            "customCode": custom_code,
            "advancedOptions": advanced_options,
            "createdAt": pd.Timestamp.now().isoformat()
        }
        with open(output_meta_path, 'w') as f:
            json.dump(metadata, f, indent=2)

        print(json.dumps(metadata))

    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
