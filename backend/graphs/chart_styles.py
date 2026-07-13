import matplotlib.pyplot as plt

def apply_light_theme(ax, zoom_level=1.0):
    plt.style.use('default')
    fig = ax.get_figure()
    fig.patch.set_facecolor('#ffffff')
    ax.set_facecolor('#f9fafb')
    
    for spine in ax.spines.values():
        spine.set_color('#e5e7eb')
        spine.set_linewidth(1)
        
    ax.grid(True, linestyle='--', color='#e5e7eb', alpha=0.7, zorder=0)
    ax.tick_params(colors='#1f2937', labelsize=8)
