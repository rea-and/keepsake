package io.keepsake.app.adapters

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import io.keepsake.app.R
import io.keepsake.app.models.Bookmark
import io.keepsake.app.utils.ImageLoader
import java.text.SimpleDateFormat
import java.util.*

class BookmarkAdapter(
    private val onItemClick: (Bookmark) -> Unit,
    private val onFavoriteClick: (Bookmark) -> Unit,
    private val onDoneClick: (Bookmark) -> Unit,
    private val onMoreClick: (Bookmark, View) -> Unit
) : ListAdapter<Bookmark, RecyclerView.ViewHolder>(DiffCallback) {

    var isGridView: Boolean = true
        set(value) {
            field = value
            notifyDataSetChanged()
        }

    companion object {
        const val VIEW_TYPE_CARD = 1
        const val VIEW_TYPE_LIST = 2

        private val DiffCallback = object : DiffUtil.ItemCallback<Bookmark>() {
            override fun areItemsTheSame(oldItem: Bookmark, newItem: Bookmark): Boolean =
                oldItem.id == newItem.id

            override fun areContentsTheSame(oldItem: Bookmark, newItem: Bookmark): Boolean =
                oldItem == newItem
        }
    }

    override fun getItemViewType(position: Int): Int {
        return if (isGridView) VIEW_TYPE_CARD else VIEW_TYPE_LIST
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
        val inflater = LayoutInflater.from(parent.context)
        return if (viewType == VIEW_TYPE_CARD) {
            val view = inflater.inflate(R.layout.item_bookmark_card, parent, false)
            CardViewHolder(view)
        } else {
            val view = inflater.inflate(R.layout.item_bookmark_list, parent, false)
            ListViewHolder(view)
        }
    }

    override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
        val item = getItem(position)
        if (holder is CardViewHolder) {
            holder.bind(item)
        } else if (holder is ListViewHolder) {
            holder.bind(item)
        }
    }

    inner class CardViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val ivCover: ImageView = itemView.findViewById(R.id.ivCover)
        private val ivFavicon: ImageView = itemView.findViewById(R.id.ivFavicon)
        private val tvDomain: TextView = itemView.findViewById(R.id.tvDomain)
        private val tvTitle: TextView = itemView.findViewById(R.id.tvTitle)
        private val tvDescription: TextView = itemView.findViewById(R.id.tvDescription)
        private val btnFavorite: ImageButton = itemView.findViewById(R.id.btnFavorite)
        private val btnDone: ImageButton = itemView.findViewById(R.id.btnDone)
        private val btnMore: ImageButton = itemView.findViewById(R.id.btnMore)
        private val readerBadge: View = itemView.findViewById(R.id.readerBadge)

        fun bind(bm: Bookmark) {
            tvTitle.text = bm.title.ifEmpty { bm.url }
            tvDomain.text = bm.domain

            if (!bm.description.isNullOrEmpty()) {
                tvDescription.text = bm.description
                tvDescription.visibility = View.VISIBLE
            } else {
                tvDescription.visibility = View.GONE
            }

            readerBadge.visibility = if (!bm.readerContent.isNullOrEmpty()) View.VISIBLE else View.GONE

            if (bm.isFavorite) {
                btnFavorite.setImageResource(R.drawable.ic_star_filled)
            } else {
                btnFavorite.setImageResource(R.drawable.ic_star_empty)
            }

            if (bm.isDone) {
                btnDone.setImageResource(R.drawable.ic_check_circle)
                btnDone.setBackgroundResource(R.drawable.bg_badge_done)
            } else {
                btnDone.setImageResource(R.drawable.ic_circle_empty)
                btnDone.setBackgroundResource(R.drawable.bg_badge)
            }

            // Cover Image
            ImageLoader.load(ivCover, bm.cover, R.drawable.ic_image_placeholder)
            // Favicon
            ImageLoader.load(ivFavicon, bm.favicon, R.drawable.ic_image_placeholder)

            itemView.setOnClickListener { onItemClick(bm) }
            btnFavorite.setOnClickListener { onFavoriteClick(bm) }
            btnDone.setOnClickListener { onDoneClick(bm) }
            btnMore.setOnClickListener { onMoreClick(bm, it) }
        }
    }

    inner class ListViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val ivThumbnail: ImageView = itemView.findViewById(R.id.ivThumbnail)
        private val tvTitle: TextView = itemView.findViewById(R.id.tvTitle)
        private val tvDomain: TextView = itemView.findViewById(R.id.tvDomain)
        private val tvDate: TextView = itemView.findViewById(R.id.tvDate)
        private val btnFavorite: ImageButton = itemView.findViewById(R.id.btnFavorite)
        private val btnDone: ImageButton = itemView.findViewById(R.id.btnDone)
        private val btnMore: ImageButton = itemView.findViewById(R.id.btnMore)

        fun bind(bm: Bookmark) {
            tvTitle.text = bm.title.ifEmpty { bm.url }
            tvDomain.text = bm.domain

            tvDate.text = formatShortDate(bm.createdAt)

            if (bm.isFavorite) {
                btnFavorite.setImageResource(R.drawable.ic_star_filled)
            } else {
                btnFavorite.setImageResource(R.drawable.ic_star_empty)
            }

            if (bm.isDone) {
                btnDone.setImageResource(R.drawable.ic_check_circle)
            } else {
                btnDone.setImageResource(R.drawable.ic_circle_empty)
            }

            val thumbUrl = bm.cover ?: bm.favicon
            ImageLoader.load(ivThumbnail, thumbUrl, R.drawable.ic_image_placeholder)

            itemView.setOnClickListener { onItemClick(bm) }
            btnFavorite.setOnClickListener { onFavoriteClick(bm) }
            btnDone.setOnClickListener { onDoneClick(bm) }
            btnMore.setOnClickListener { onMoreClick(bm, it) }
        }

        private fun formatShortDate(isoString: String): String {
            return try {
                val inputDf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).apply {
                    timeZone = TimeZone.getTimeZone("UTC")
                }
                val date = inputDf.parse(isoString) ?: return ""
                val outputDf = SimpleDateFormat("• MMM d", Locale.US)
                outputDf.format(date)
            } catch (e: Exception) {
                ""
            }
        }
    }
}
