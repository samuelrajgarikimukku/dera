import re

path = r"c:\Users\samue\Documents\MINE\Personal Project\src\components\LinearRegressionWorkspace.jsx"

with open(path, 'r', encoding='utf-8') as f:
    for i, line in enumerate(f, 1):
        if "dataset." in line:
            print(f"{i}: {line.strip()}")
